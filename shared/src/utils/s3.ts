/**
 * S3 helper: put/get objects and mint time-limited pre-signed URLs.
 *
 * Resumes and generated documents live in a private S3 bucket (no public
 * access, Requirements 2.1 / design Trust boundaries). The frontend never
 * touches the bucket directly; instead it receives short-lived pre-signed URLs
 * minted here.
 *
 * The underlying S3 client and URL signer are injectable so unit tests can run
 * without AWS; in production they are lazily built from the default credential
 * chain and region.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Default region — reads from AWS_DEFAULT_REGION env var, falls back to us-west-2. */
const DEFAULT_REGION = process.env.AWS_DEFAULT_REGION ?? 'us-west-2';

/** Default pre-signed URL lifetime: 15 minutes. */
const DEFAULT_EXPIRY_SECONDS = 900;

/** Minimal structural type the wrapper needs; satisfied by S3Client. */
export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

/** Signer function shape; defaults to the AWS request presigner. */
export type PresignerFn = (
  client: S3ClientLike,
  command: unknown,
  options: { expiresIn: number },
) => Promise<string>;

export interface S3HelperOptions {
  /** Bucket all operations target unless overridden per-call. */
  bucket: string;
  /** Inject a pre-built S3 client (e.g. a fake in tests). */
  client?: S3ClientLike;
  /** Inject a custom presigner (e.g. a fake in tests). */
  presigner?: PresignerFn;
  /** Region override used only when constructing a real client. */
  region?: string;
  /** Extra config forwarded to the real `S3Client` constructor. */
  clientConfig?: S3ClientConfig;
}

/** Body types accepted when putting an object. */
export type PutBody = string | Uint8Array | Buffer;

export interface PutObjectOptions {
  contentType?: string;
  /** Override the configured bucket for this call. */
  bucket?: string;
}

export class S3Helper {
  private readonly bucket: string;
  private readonly client: S3ClientLike;
  private readonly presigner: PresignerFn;

  constructor(options: S3HelperOptions) {
    if (!options.bucket) {
      throw new Error('S3Helper requires a bucket name');
    }
    this.bucket = options.bucket;
    this.client =
      options.client ??
      new S3Client({ region: options.region ?? DEFAULT_REGION, ...options.clientConfig });
    this.presigner =
      options.presigner ??
      ((client, command, opts) =>
        getSignedUrl(
          client as S3Client,
          command as GetObjectCommand,
          opts,
        ));
  }

  /** Upload an object under `key`. */
  async putObject(
    key: string,
    body: PutBody,
    options: PutObjectOptions = {},
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: options.bucket ?? this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
      }),
    );
  }

  /** Fetch an object's contents as a Buffer. */
  async getObject(key: string, bucket?: string): Promise<Buffer> {
    const result = (await this.client.send(
      new GetObjectCommand({ Bucket: bucket ?? this.bucket, Key: key }),
    )) as { Body?: unknown };
    return collectBody(result.Body);
  }

  /**
   * Mint a time-limited pre-signed GET URL for `key`. Default lifetime is 15
   * minutes; pass `expiresIn` (seconds) to override.
   */
  async getPresignedUrl(
    key: string,
    expiresIn: number = DEFAULT_EXPIRY_SECONDS,
    bucket?: string,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket ?? this.bucket,
      Key: key,
    });
    return this.presigner(this.client, command, { expiresIn });
  }
}

/**
 * Normalise an S3 `GetObject` body into a Buffer. The AWS SDK returns a
 * stream-like object in Node; we support web ReadableStream, Node streams, and
 * already-collected byte arrays.
 */
async function collectBody(body: unknown): Promise<Buffer> {
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }
  // Node.js Readable / web stream exposing transformToByteArray (SDK v3 helper).
  const maybeTransform = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof maybeTransform.transformToByteArray === 'function') {
    return Buffer.from(await maybeTransform.transformToByteArray());
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  // Async iterable of chunks (Node Readable stream).
  const asyncIterable = body as AsyncIterable<Uint8Array>;
  if (typeof asyncIterable[Symbol.asyncIterator] === 'function') {
    const chunks: Uint8Array[] = [];
    for await (const chunk of asyncIterable) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  }
  throw new Error('Unsupported S3 body type');
}

/** Convenience factory mirroring the {@link S3Helper} constructor. */
export function createS3Helper(options: S3HelperOptions): S3Helper {
  return new S3Helper(options);
}
