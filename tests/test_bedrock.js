#!/usr/bin/env node
// Standalone Bedrock test — run with env vars set
// Usage: AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=... AWS_DEFAULT_REGION=... node test_bedrock.js

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const region = process.env.AWS_DEFAULT_REGION || "us-west-2";

console.log("=== AWS Bedrock Test ===");
console.log("Region:         ", region);
console.log("Access Key ID:  ", process.env.AWS_ACCESS_KEY_ID?.slice(0, 8) + "...");
console.log("Session Token:  ", process.env.AWS_SESSION_TOKEN ? "present (" + process.env.AWS_SESSION_TOKEN.length + " chars)" : "MISSING");
console.log("");

async function testBedrock() {
  const client = new BedrockRuntimeClient({ region });

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 50,
    messages: [{ role: "user", content: "Say hello in one word." }],
  };

  // const modelId = "anthropic.claude-3-haiku-20240307-v1:0";
  // const modelId = "anthropic.claude-sonnet-4-6"

  const modelId = "arn:aws:bedrock:us-east-1::inference-profile/us.anthropic.claude-sonnet-4-6"
  console.log(`Invoking model: ${modelId}`);
  console.log("Sending request...\n");

  try {
    const response = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload),
      })
    );

    const body = JSON.parse(new TextDecoder().decode(response.body));
    console.log("SUCCESS!");
    console.log("Response:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("FAILED:", err.name);
    console.error("Message:", err.message);
    if (err.$metadata) {
      console.error("HTTP status:", err.$metadata.httpStatusCode);
      console.error("Request ID: ", err.$metadata.requestId);
    }

    if (err.name === "UnrecognizedClientException") {
      console.error("\nHint: Session token is invalid or expired. Refresh your credentials.");
    }
    if (err.name === "AccessDeniedException") {
      console.error("\nHint: Credentials are valid but this IAM role lacks bedrock:InvokeModel permission.");
    }
    if (err.name === "ValidationException") {
      console.error("\nHint: Model ID may not be available in region:", region);
    }
    process.exit(1);
  }
}

testBedrock();
