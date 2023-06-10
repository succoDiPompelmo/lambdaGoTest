import {S3ObjectCreatedNotificationEvent} from "aws-lambda/trigger/s3-event-notification";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

import {AddressObject, ParsedMail, simpleParser} from 'mailparser';
import Connection from "rabbitmq-client";
  
export async function handleRequest(event: S3ObjectCreatedNotificationEvent): Promise<Email | undefined> {
    const bucketName: string = event.detail.bucket.name
    const objectKey: string = event.detail.object.key

    var client: S3Client = new S3Client({region: "us-east-1", endpoint: "http://localhost:4566", forcePathStyle: true});

    const input = {
      Bucket: bucketName,
      Key: objectKey,
    };

    const command = new GetObjectCommand(input);
    const response = await client.send(command);

    const s3File = await response.Body?.transformToString();

    if (s3File == undefined) {
      return undefined
    }

    let parsed = await simpleParser(s3File);
    console.log(parsed.attachments.pop()?.contentDisposition);

    const message = buildMessage(parsed)

    // See API docs for all options
    const rabbit = new Connection({
      url: 'amqps://deduukdi:hGLNmhiL2tad6MsHC_4z1H0aKSO12I6R@chimpanzee.rmq.cloudamqp.com/deduukdi',
      // wait 1 to 30 seconds between connection retries
      retryLow: 1000,
      retryHigh: 30000,
    })

    // See API docs for all options
    const pro = rabbit.createPublisher({
      // enable acknowledgements (resolve with error if publish is unsuccessful)
      confirm: true,
      // enable retries
      maxAttempts: 2,
      // ensure the existence of an exchange before we use it otherwise we could
      // get a NOT_FOUND error
      exchanges: [{exchange: 'Events', durable: true}]
    })

    await pro.publish(
      {exchange: 'Events', routingKey: 'my_routing_key'},
      message)

    return message
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

function buildMessage(parsedEmail: ParsedMail) {
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