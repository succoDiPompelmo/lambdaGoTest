import {S3ObjectCreatedNotificationEvent} from "aws-lambda/trigger/s3-event-notification";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

import {AddressObject, ParsedMail, simpleParser} from 'mailparser';
import Connection, { Publisher } from "rabbitmq-client";
  
export async function handleRequest(event: S3ObjectCreatedNotificationEvent): Promise<Email | undefined> {
    const bucketName: string = event.detail.bucket.name
    const objectKey: string = event.detail.object.key

    const ctx = buildContext();

    const input = {
      Bucket: bucketName,
      Key: objectKey,
    };

    const command = new GetObjectCommand(input);
    const response = await ctx.s3client.send(command);
    const s3File = await response.Body?.transformToString();

    if (s3File == undefined) {
      return undefined
    }

    let parsed = await simpleParser(s3File);
    const message = buildMessage(parsed)

    await ctx.publisher.publish({exchange: 'Events', routingKey: 'my_routing_key'}, message)

    close(ctx)
    
    return message
}

interface Context {
  publisher: Publisher,
  s3client: S3Client,
  rabbit: Connection
}

function buildContext(): Context {

  const client: S3Client = new S3Client({region: "us-east-1", endpoint: "http://localhost:4566", forcePathStyle: true});

  const rabbit = new Connection({
    url: 'amqps://deduukdi:hGLNmhiL2tad6MsHC_4z1H0aKSO12I6R@chimpanzee.rmq.cloudamqp.com/deduukdi',
    retryLow: 1000,
    retryHigh: 30000,
  })

  const pub = rabbit.createPublisher({
    confirm: true,
    maxAttempts: 2,
    exchanges: [{exchange: 'Events', durable: true}]
  })

  return {
    s3client: client,
    publisher: pub,
    rabbit: rabbit
  }
}

function close(ctx: Context) {
  ctx.publisher.close()
  ctx.rabbit.close()
  ctx.s3client.destroy()
}

interface Email {
  subject: string;
  from: string[];
  to: string[];
  date: Date;
  text: string;
  attachments: Attachment[];
}

interface Attachment {
  contentDisposition: string;
  contentType: string;
  filename: string;
}

function buildMessage(parsedEmail: ParsedMail): Email {
  return {
    subject: parsedEmail.subject ?? "",
    from: parsedEmail.from?.value.map(fromAddress => {return fromAddress.address ?? ""}) ?? [],
    to: parseTo(parsedEmail.to) ?? [],
    date: parsedEmail.date ?? new Date(),
    text: "",
    attachments: []
  }
}

function parseTo(to: AddressObject | AddressObject[] | undefined): string[] {
  if (to == undefined) {
    return []
  }

  if (Array.isArray(to)) {
    return to.flatMap(address => {return address.value.map(toAddress => {return toAddress.address ?? ""})})
  }

  return to.value.map(toAddress => {return toAddress.address ?? ""})
}

  export const lambdaHandler = async (
     event: S3ObjectCreatedNotificationEvent
  ): Promise<any> => {

    await handleRequest(event)

    return {
      statusCode: 200,
      body: JSON.stringify("")
    }
  }