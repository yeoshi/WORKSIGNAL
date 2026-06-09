import { describe, it, expect } from 'vitest';
import { S3Helper, type S3ClientLike } from './s3.js';

interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

function fakeClient(
  responses: Record<string, unknown[]> = {},
): S3ClientLike & { sent: SentCommand[] } {
  const queues: Record<string, unknown[]> = { ...responses };
  const sent: SentCommand[] = [];
  return {
    sent,
    async send(command: unknown) {
      const cmd = command as { constructor: { name: string }; input: Record<string, unknown> };
      const name = cmd.constructor.name;
      sent.push({ name, input: cmd.input });
      const queue = queues[name];
      return (queue && queue.length > 0 ? queue.shift() : undefined) ?? {};
    },
  };
}

describe('S3Helper', () => {
  it('requires a bucket name', () => {
    expect(() => new S3Helper({ bucket: '' })).toThrow(/bucket/);
  });

  it('putObject sends a PutObjectCommand with bucket, key, body, and content type', async () => {
    const client = fakeClient();
    const s3 = new S3Helper({ bucket: 'resumes', client });
    await s3.putObject('users/u1/resume.pdf', Buffer.from('PDF'), {
      contentType: 'application/pdf',
    });
    expect(client.sent[0]).toMatchObject({
      name: 'PutObjectCommand',
      input: {
        Bucket: 'resumes',
        Key: 'users/u1/resume.pdf',
        ContentType: 'application/pdf',
      },
    });
  });

  it('getObject collects a body exposing transformToByteArray', async () => {
    const client = fakeClient({
      GetObjectCommand: [
        { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } },
      ],
    });
    const s3 = new S3Helper({ bucket: 'resumes', client });
    const buf = await s3.getObject('k');
    expect(Array.from(buf)).toEqual([1, 2, 3]);
  });

  it('getObject collects a body from an async-iterable stream', async () => {
    async function* chunks() {
      yield new Uint8Array([10]);
      yield new Uint8Array([20, 30]);
    }
    const client = fakeClient({ GetObjectCommand: [{ Body: chunks() }] });
    const s3 = new S3Helper({ bucket: 'resumes', client });
    const buf = await s3.getObject('k');
    expect(Array.from(buf)).toEqual([10, 20, 30]);
  });

  it('getObject returns an empty buffer for an empty body', async () => {
    const client = fakeClient({ GetObjectCommand: [{}] });
    const s3 = new S3Helper({ bucket: 'resumes', client });
    expect((await s3.getObject('k')).length).toBe(0);
  });

  it('getPresignedUrl delegates to the injected presigner with default expiry', async () => {
    const client = fakeClient();
    let capturedExpiry = -1;
    let capturedCommandName = '';
    const s3 = new S3Helper({
      bucket: 'resumes',
      client,
      presigner: async (_c, command, opts) => {
        capturedExpiry = opts.expiresIn;
        capturedCommandName = (command as { constructor: { name: string } }).constructor.name;
        return 'https://signed.example/resume';
      },
    });
    const url = await s3.getPresignedUrl('users/u1/resume.pdf');
    expect(url).toBe('https://signed.example/resume');
    expect(capturedExpiry).toBe(900);
    expect(capturedCommandName).toBe('GetObjectCommand');
  });

  it('getPresignedUrl honours a custom expiry', async () => {
    const s3 = new S3Helper({
      bucket: 'resumes',
      client: fakeClient(),
      presigner: async (_c, _command, opts) => `expires=${opts.expiresIn}`,
    });
    expect(await s3.getPresignedUrl('k', 60)).toBe('expires=60');
  });
});
