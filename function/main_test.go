package main

import (
	"context"
	"fmt"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/wagslane/go-rabbitmq"
)

func TestAdd(t *testing.T) {
	config := newTestConfig()
	defer config.Close()

	events := events.S3Event{
		Records: []events.S3EventRecord{{S3: events.S3Entity{Bucket: events.S3Bucket{Name: "sample-bucket"}, Object: events.S3Object{Key: "index.html"}}}},
	}

	got, err := handleRequest(context.Background(), events, config)

	if err != nil {
		t.Errorf("got an error from the handler")
	}

	want := "output"

	if got != want {
		t.Errorf("got %q, wanted %q", got, want)
	}

	fmt.Printf("Test Passed with %q", got)
}

func newTestConfig() *Config {
	sess, err := session.NewSession(&aws.Config{
		Region:           aws.String("us-east-1"),
		Credentials:      credentials.NewStaticCredentials("test", "test", ""),
		S3ForcePathStyle: aws.Bool(true),
		Endpoint:         aws.String("http://localhost:4566"),
	})

	if err != nil {
		exitErrorf("Unable to establish a new aws session, %v", err)
	}

	conn, err := rabbitmq.NewConn("amqp://guest:guest@localhost:5672/")
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
