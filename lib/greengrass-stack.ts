import * as cdk from "aws-cdk-lib";
import {
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_iam as iam,
  aws_iot as iot,
  custom_resources as cr,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as cpactions,
  aws_codebuild as codebuild,
} from "aws-cdk-lib";
// ... other necessary imports ...

export class GreengrassCdkProjectStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for storing component zips
    const componentBucket = new s3.Bucket(this, "ComponentBucket", {
      versioned: true, // Optional based on your needs
    });

    // Greengrass Thing Group
    const thingGroup = new iot.CfnThingGroup(this, "ThingGroup", {
      thingGroupName: "MyGreengrassThingGroup",
    });

    // IAM Role for Greengrass
    const greengrassRole = new iam.Role(this, "GreengrassRole", {
      assumedBy: new iam.ServicePrincipal("greengrass.amazonaws.com"),
      // Add necessary permissions
    });

    // IAM role for Lambda functions and Greengrass
    const lambdaRole = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      // Add necessary IAM policies for Greengrass, S3, etc.
    });

    // Lambda function for creating the Greengrass component
    const createComponentLambda = new lambda.Function(
      this,
      "CreateComponentLambda",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "createComponent.handler",
        code: lambda.Code.fromAsset("path/to/your/lambda/createComponent"),
        role: lambdaRole,
        environment: {
          BUCKET_NAME: componentBucket.bucketName,
          // ... other necessary environment variables ...
        },
      }
    );

    // Lambda function for updating the Greengrass component
    const updateComponentLambda = new lambda.Function(
      this,
      "UpdateComponentLambda",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        handler: "updateComponent.handler",
        code: lambda.Code.fromAsset("path/to/your/lambda/updateComponent"),
        role: lambdaRole,
        environment: {
          BUCKET_NAME: componentBucket.bucketName,
          // ... other necessary environment variables ...
        },
      }
    );

    // Custom resource to trigger the creation Lambda function
    const createComponentCustomResource = new cr.AwsCustomResource(
      this,
      "CreateComponentCustomResource",
      {
        onCreate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: createComponentLambda.functionName,
            // Include payload if necessary
            Payload: JSON.stringify({
              /* payload content */
            }),
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            "CreateComponentCustomResource"
          ),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    // Grant necessary permissions to the custom resource to invoke the Lambda function
    createComponentLambda.grantInvoke(
      createComponentCustomResource.grantPrincipal
    );

    // Define the source artifact and the build artifact
    const sourceArtifact = new codepipeline.Artifact();
    const buildArtifact = new codepipeline.Artifact();

    // GitHub source action
    const sourceAction = new cpactions.GitHubSourceAction({
      actionName: "GitHub_Source",
      owner: "GITHUB_USER_OR_ORG",
      repo: "GITHUB_REPO",
      oauthToken: cdk.SecretValue.secretsManager("GITHUB_TOKEN"),
      output: sourceArtifact,
      branch: "main", // Your target branch
    });

    // CodeBuild project to zip and upload
    const buildProject = new codebuild.PipelineProject(
      this,
      "ZipAndUploadProject",
      {
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        },
        // Define build commands in buildspec
        environmentVariables: {
          LAMBDA_FUNCTION_NAME: { value: updateComponentLambda.functionName },
          BUCKET_NAME: { value: componentBucket.bucketName },
        },
      }
    );

    const buildAction = new cpactions.CodeBuildAction({
      actionName: "Build_Zip_Upload",
      project: buildProject,
      input: sourceArtifact,
      outputs: [buildArtifact],
    });

    // Define the pipeline
    const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
      stages: [
        {
          stageName: "Source",
          actions: [sourceAction],
        },
        {
          stageName: "Build",
          actions: [buildAction],
        },
        // ... Additional stages (Lambda invoke) ...
      ],
    });

    // Example in CDK
    const codeBuildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      // other properties...
    });

    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          "arn:aws:lambda:region:account-id:function:UpdateComponentLambda",
        ],
      })
    );
  }
}
