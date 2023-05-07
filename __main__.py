import json
import pulumi
import pulumi_aws as aws
import pulumi_aws_apigateway as apigateway
import pulumi_docker as docker

# repo = aws.ecrpublic.Repository('lambda-repository', repository_name='lambda')
# cred = aws.ecrpublic.get_authorization_token()

# pulumi.export("repository uri", repo.repository_uri)

# registry = docker.ImageRegistry(
#     server="public.ecr.aws/w0d6s5v1/lambda", 
#     username=cred.user_name, 
#     password=cred.password)

# image = docker.Image(
#     'hello-world', 
#     build='function', 
#     image_name=repo.repository_uri,
#     registry=registry
#     )

bucket = aws.s3.BucketV2("bucket", bucket="prova-incoming-lambda-go-documents", force_destroy=True)

# An execution role to use for the Lambda function
role = aws.iam.Role("role", 
    assume_role_policy=json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com",
            },
        }],
    }),
    managed_policy_arns=[aws.iam.ManagedPolicy.AWS_LAMBDA_BASIC_EXECUTION_ROLE, aws.iam.ManagedPolicy.AMAZON_S3_READ_ONLY_ACCESS])

# A Lambda function to invoke
thumbnailer = aws.lambda_.Function("hello", runtime="go1.x", code=pulumi.FileArchive("./function/main.zip"), handler="main", role=role.arn, timeout=60, publish=True)

allow_bucket = aws.lambda_.Permission("allowBucket",
    action="lambda:InvokeFunction",
    function=thumbnailer.arn,
    principal="s3.amazonaws.com",
    source_arn=bucket.arn)

bucket_notification = aws.s3.BucketNotification("bucketNotification",
    bucket=bucket.id,
    lambda_functions=[aws.s3.BucketNotificationLambdaFunctionArgs(
        lambda_function_arn=thumbnailer.arn,
        events=["s3:ObjectCreated:*"]
    )],
    opts=pulumi.ResourceOptions(depends_on=[allow_bucket]))
