package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/mnako/letters"
	"github.com/wagslane/go-rabbitmq"
)

type DocumentsEmailRecieved struct {
	Subject      string          `json:"subject"`
	From         []string        `json:"from"`
	To           []string        `json:"to"`
	Date         time.Time       `json:"date"`
	Text         string          `json:"text"`
	Attachements []*Attachements `json:"attachements"`
}

type Attachements struct {
	ContentType        string `json:"contentType"`
	ContentDisposition string `json:"contentDisposition"`
}

type Config struct {
	awsSession                      *session.Session
	rabbitmqConn                    *rabbitmq.Conn
	documentsEmailRecievedPublisher *rabbitmq.Publisher
}

func main() {
	lambda.Start(HandleRequestWrapper)
}

func HandleRequestWrapper(ctx context.Context, events events.S3Event) (string, error) {

	config := newConfig()
	defer config.Close()

	return handleRequest(ctx, events, config)
}

func newConfig() *Config {
	sess, err := session.NewSession(&aws.Config{Region: aws.String("us-east-1")})

	if err != nil {
		exitErrorf("Unable to establish a new aws session, %v", err)
	}

	conn, err := rabbitmq.NewConn("amqps://deduukdi:hGLNmhiL2tad6MsHC_4z1H0aKSO12I6R@chimpanzee.rmq.cloudamqp.com/deduukdi")
	if err != nil {
		exitErrorf("No connection to RabbitMQ host, %v", err)
	}

	publisher, err := rabbitmq.NewPublisher(
		conn,
		rabbitmq.WithPublisherOptionsLogging,
		rabbitmq.WithPublisherOptionsExchangeName("Events"),
		rabbitmq.WithPublisherOptionsExchangeDeclare,
		rabbitmq.WithPublisherOptionsExchangeDurable,
	)
	if err != nil {
		exitErrorf("New publisher failure creation: %v", err)
	}

	return &Config{awsSession: sess, rabbitmqConn: conn, documentsEmailRecievedPublisher: publisher}
}

func (config *Config) Close() {
	config.rabbitmqConn.Close()
	config.documentsEmailRecievedPublisher.Close()
}

func handleRequest(ctx context.Context, events events.S3Event, config *Config) (string, error) {
	for _, record := range events.Records {
		object := getS3Object(config.awsSession, record.S3.Bucket.Name, record.S3.Object.Key)

		email, err := letters.ParseEmail(bytes.NewReader(object))
		if err != nil {
			exitErrorf("Failure parsing the email")
		}

		fmt.Println("Email recieved from subject", email.Headers.Subject)

		message, err := json.Marshal(newDocumentsEmailRecieved(email))
		if err != nil {
			exitErrorf("Message build failed: %v", err)
		}

		err = config.documentsEmailRecievedPublisher.Publish(
			message,
			[]string{"my_routing_key"},
			rabbitmq.WithPublishOptionsContentType("application/json"),
			rabbitmq.WithPublishOptionsExchange("Events"),
		)
		if err != nil {
			exitErrorf("Failure publishing: %v", err)
		}
	}

	return "output", nil
}

func getS3Object(sess *session.Session, bucketName string, objectKey string) []byte {
	downloader := s3manager.NewDownloader(sess)
	buf := aws.NewWriteAtBuffer([]byte{})

	numBytes, err := downloader.Download(buf,
		&s3.GetObjectInput{
			Bucket: aws.String(bucketName),
			Key:    aws.String(objectKey),
		})
	if err != nil {
		exitErrorf("Unable to download item %q, %v", objectKey, err)
	}

	fmt.Println("Downloaded", bucketName, numBytes, "bytes")

	return buf.Bytes()
}

func newDocumentsEmailRecieved(email letters.Email) *DocumentsEmailRecieved {

	from_adresses := make([]string, len(email.Headers.From))
	for i, e := range email.Headers.From {
		from_adresses[i] = e.Address
	}

	to_adresses := make([]string, len(email.Headers.To))
	for i, e := range email.Headers.To {
		to_adresses[i] = e.Address
	}

	attachements := make([]*Attachements, len(email.AttachedFiles))
	for i, e := range email.AttachedFiles {
		attachements[i] = &Attachements{
			ContentType:        e.ContentType.ContentType,
			ContentDisposition: string(e.ContentDisposition.ContentDisposition),
		}
	}

	documentsEmailRecieved := &DocumentsEmailRecieved{
		Subject:      email.Headers.Subject,
		From:         from_adresses,
		To:           to_adresses,
		Date:         email.Headers.Date,
		Text:         email.Text,
		Attachements: attachements,
	}

	return documentsEmailRecieved
}

func exitErrorf(msg string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, msg+"\n", args...)
	os.Exit(1)
}
