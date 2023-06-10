import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { handleRequest } from '../index.ts';

import {S3ObjectCreatedNotificationEvent} from "aws-lambda/trigger/s3-event-notification";

import { promises as fs } from "fs";

async function loadMonoCounter() {
  const data = await fs.readFile("Prova.eml", "utf8");
  return Buffer.from(data).toString();
}

describe('testing index file', () => {
  test('empty string should result in zero', async () => {

    const data = await loadMonoCounter();

    var client: S3Client = new S3Client({region: "us-east-1", endpoint: "http://localhost:4566", forcePathStyle: true});

    const l_input = {
      "Bucket": "sample-bucket"
    };
    const l_command = new CreateBucketCommand(l_input);
    const l_response = await client.send(l_command);

    const input = {
      "Body": data,
      "Bucket": "sample-bucket",
      "Key": "index.html"
    };
    const command = new PutObjectCommand(input);
    await client.send(command);

    let request_body: S3ObjectCreatedNotificationEvent = {
      id: "",
      version: "",
      source: "aws.s3",
      account: "asd",
      time: "",
      region: "",
      detail: {"source-ip-address": "", version: "0", bucket: {name: "sample-bucket"}, object: {key: "index.html", size: 1, etag: "", "version-id": "", sequencer: ""}, "request-id": "", requester: "",reason:"PutObject"},
      resources: [],
      "detail-type": "Object Created"
    }

    expect(await handleRequest(request_body)).toStrictEqual({"attachments": [], "date": new Date("2023-03-22T17:30:42.000Z"), "from": ["noreply@event.eventbrite.com"], "subject": "Logistica per Concorrenza strutturata e coroutine in Java e Kotlin", "text": "", "to": ["zenari12@gmail.com"]});
  });
});