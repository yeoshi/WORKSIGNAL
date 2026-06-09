/**
 * Private S3 bucket definition for WORKSIGNAL.
 *
 * Holds uploaded resumes and generated documents (customised resumes and
 * cover-letter material). DynamoDB tables store only the S3 *keys*, never the
 * blobs themselves (design: Data Models).
 *
 * Security posture (design: Trust and Security Boundaries):
 * - The bucket is fully private: all public access is blocked and a deny
 *   policy rejects any non-TLS (insecure) request.
 * - The frontend never receives direct/public object URLs. Instead it is
 *   handed time-limited **pre-signed URLs** generated server-side, which is
 *   the only sanctioned access pattern for both reads and writes.
 *
 * This is an infrastructure *definition* (declarative config). It is wired to
 * a concrete provisioning mechanism and to the runtime pre-signed-URL helper
 * in later tasks; for now it captures the required shape and guarantees.
 */
import { AWS_REGION } from '@worksignal/shared';

/** Public-access-block settings. All four flags are enabled for full privacy. */
export interface S3PublicAccessBlock {
  readonly blockPublicAcls: boolean;
  readonly ignorePublicAcls: boolean;
  readonly blockPublicPolicy: boolean;
  readonly restrictPublicBuckets: boolean;
}

/** Server-side encryption configuration for objects at rest. */
export interface S3Encryption {
  /** SSE algorithm applied to every stored object. */
  readonly algorithm: 'AES256' | 'aws:kms';
  /** Reject uploads that are not encrypted in transit / at rest. */
  readonly enforced: boolean;
}

/** Lifecycle of how the bucket is reached by the application tier. */
export type S3AccessPattern = 'pre-signed-url';

/** Logical key prefixes used to organise objects within the single bucket. */
export interface S3KeyPrefixes {
  /** Original user-uploaded resumes, e.g. `resumes/{userId}/{uuid}.pdf`. */
  readonly resumes: string;
  /** Generated/customised application documents, e.g. `generated/{userId}/{applicationId}/...`. */
  readonly generated: string;
}

/** Declarative definition of the private documents bucket. */
export interface S3BucketDefinition {
  /** Logical resource id used when wiring targets/permissions later. */
  readonly logicalId: string;
  /** Deployment region — must match the rest of the stack. */
  readonly region: string;
  /** When true, no public ACLs or policies are permitted. */
  readonly isPrivate: boolean;
  readonly publicAccessBlock: S3PublicAccessBlock;
  readonly encryption: S3Encryption;
  /** Versioning protects against accidental overwrite/delete of documents. */
  readonly versioned: boolean;
  /** The only sanctioned way the app/frontend accesses objects. */
  readonly accessPattern: S3AccessPattern;
  readonly keyPrefixes: S3KeyPrefixes;
  /** Default TTL (seconds) for generated pre-signed URLs. */
  readonly presignedUrlTtlSeconds: number;
}

/**
 * The single private bucket for resumes and generated documents.
 *
 * Notes:
 * - `isPrivate` + all `publicAccessBlock` flags enabled guarantee no object is
 *   ever publicly reachable; access is exclusively via pre-signed URLs.
 * - `presignedUrlTtlSeconds` of 900 (15 minutes) keeps URLs short-lived.
 */
export const documentsBucket: S3BucketDefinition = {
  logicalId: 'WorkSignalDocumentsBucket',
  region: AWS_REGION,
  isPrivate: true,
  publicAccessBlock: {
    blockPublicAcls: true,
    ignorePublicAcls: true,
    blockPublicPolicy: true,
    restrictPublicBuckets: true,
  },
  encryption: {
    algorithm: 'AES256',
    enforced: true,
  },
  versioned: true,
  accessPattern: 'pre-signed-url',
  keyPrefixes: {
    resumes: 'resumes/',
    generated: 'generated/',
  },
  presignedUrlTtlSeconds: 900,
};
