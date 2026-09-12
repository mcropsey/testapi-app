// TestAPI App - CI/CD pipeline
// Build in Jenkins (docker/dind), smoke-test the image, then deploy to the
// podman host (192.168.1.103) where the app runs as a container.
//
//   Every build -> build, test, deploy, verify (job is pinned to the main branch)
pipeline {
  agent any

  environment {
    APP        = 'testapi-app'
    DEPLOY     = 'mcropsey@192.168.1.103'
    DEPLOY_URL = 'http://192.168.1.103:3000'
  }

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    stage('Build') {
      steps {
        script {
          env.IMAGE_TAG = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          echo "Building ${APP}:${env.IMAGE_TAG}"
          sh "docker build -t ${APP}:${env.IMAGE_TAG} -t ${APP}:latest ."
        }
      }
    }

    stage('Test') {
      steps {
        script {
          // dind sidecar: app runs inside the dind daemon, published on the
          // dind container's netns -> reachable from the agent as http://docker:3100
          sh "docker run -d --rm --name testapi-ci -p 3100:3000 ${APP}:${env.IMAGE_TAG}"
          sh '''
            set -e
            BASE=http://docker:3100
            echo "Waiting for app at $BASE ..."
            up=0
            for i in $(seq 1 30); do
              if curl -fsS $BASE/api/health >/dev/null 2>&1; then up=1; break; fi
              sleep 1
            done
            [ "$up" = "1" ] || { echo "FATAL: app never became healthy"; docker logs testapi-ci || true; exit 1; }
            curl -fsS $BASE/api/health; echo

            echo "Testing login..."
            TOKEN=$(curl -fsS -X POST $BASE/api/auth/login \
              -H 'Content-Type: application/json' \
              -d '{"username":"mike1","password":"Mypassword1"}' \
              | sed 's/.*"token":"\\([^"]*\\)".*/\\1/')
            [ -n "$TOKEN" ] || { echo "FATAL: login failed"; exit 1; }

            echo "Testing list users..."
            curl -fsS $BASE/api/users -H "Authorization: Bearer $TOKEN" >/dev/null

            echo "Testing create user..."
            curl -fsS -X POST $BASE/api/users \
              -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
              -d '{"username":"ci-smoke","password":"Testpass1","profile":{"fullName":"CI Smoke","email":"ci-smoke@example.com"}}' >/dev/null

            echo "Testing delete user..."
            curl -fsS -X DELETE $BASE/api/users/ci-smoke -H "Authorization: Bearer $TOKEN" >/dev/null

            echo "All smoke tests passed."
          '''
        }
      }
    }

    stage('DAST') {
      steps {
        script {
          // Workspace dir the scanner mounts for reports/config.
          sh 'mkdir -p akamai'

          // Start the app under test. The scanner runs with --network=host,
          // which under dind resolves to the dind container's netns, so the
          // app must be published there; 3000:3000 makes it reachable from
          // the scanner as http://localhost:3000 (the Active test-group
          // target must match this URL). If port 3000 is taken in the dind
          // netns, change the -p mapping AND the test-group target together
          // (e.g. 3100:3000 -> http://localhost:3100).
          sh 'docker rm -f testapi-dast 2>/dev/null || true'
          sh 'docker run -d --rm --name testapi-dast -p 3000:3000 ${APP}:${env.IMAGE_TAG}'

          // Wait for the app to be healthy (agent sees dind published ports
          // via the docker host, same pattern as the Test stage).
          sh '''
            set -e
            up=0
            for i in $(seq 1 30); do
              if curl -fsS http://docker:3000/api/health >/dev/null 2>&1; then up=1; break; fi
              sleep 1
            done
            [ "$up" = "1" ] || { echo "FATAL: app never became healthy for DAST"; docker logs testapi-dast || true; exit 1; }
            echo "App healthy; starting Active scan."
          '''

          // Registry/scan credentials come from the Jenkins job configuration
          // (job config environment variables or credentials binding) -
          // never from the repo (it is public).
          // Bare $vars (no braces) are NOT Groovy-interpolated, so the shell
          // expands them from the agent environment - works whether the values
          // come from job-config env vars or the pipeline environment block.
          sh 'docker login $ACTIVE_REGISTRY_URL -u $ACTIVE_REGISTRY_USER -p $ACTIVE_REGISTRY_PASSWORD'

          // Run the scanner (image version resolved from the Active backend).
          sh '''
            docker run \
              --network=host \
              -e ACTIVE_BACKEND_URI="$ACTIVE_BACKEND_URI" \
              -e CORE_CLI_CLIENT_ID="$CORE_CLI_CLIENT_ID" \
              -e CORE_CLI_CLIENT_SECRET="$CORE_CLI_CLIENT_SECRET" \
              -v "$(pwd)/akamai:/akamai" \
              "$ACTIVE_REGISTRY_URL/active-cli:$(curl -k "$ACTIVE_API_URL/backend/version")" \
              scan \
              --api-url="$ACTIVE_API_URL" \
              --env-id="$ENV_ID" \
              --test-group-id="$TEST_GROUP_ID" \
              --app-version="$BRANCH_NAME" \
              --verbose
          '''
        }
      }
      post {
        always {
          sh 'docker rm -f testapi-dast 2>/dev/null || true'
        }
      }
    }

    stage('Deploy') {
      steps {
        script {
          def tag = env.IMAGE_TAG
          echo "Deploying ${APP}:${tag} to ${DEPLOY}"
          sh """
            # Tag with the localhost/ registry prefix so `podman load` restores
            # the exact name we run. A bare name (testapi-app) would be
            # interpreted as docker.io/library/testapi-app and not be found.
            docker tag ${APP}:${tag} localhost/${APP}:${tag}
            docker save localhost/${APP}:${tag} | gzip > /tmp/image-${tag}.tgz
          """
          sh "scp -o StrictHostKeyChecking=accept-new /tmp/image-${tag}.tgz ${DEPLOY}:/tmp/"
          sh """
            ssh -o StrictHostKeyChecking=accept-new ${DEPLOY} '
              set -e
              echo "Loading image on podman host..."
              podman load < /tmp/image-${tag}.tgz
              rm -f /tmp/image-${tag}.tgz
              # Keep the :latest alias in sync with this release.
              podman tag localhost/${APP}:${tag} localhost/${APP}:latest
              echo "Replacing container (data volume is kept)..."
              podman rm -f testapi-app 2>/dev/null || true
              podman run -d --name testapi-app --restart unless-stopped \\
                -p 3000:3000 -v testapi-app-data:/app/data localhost/${APP}:${tag}
              echo "Container started."
            '
          """
        }
      }
    }

    stage('Verify') {
      steps {
        sh '''
          set -e
          up=0
          for i in $(seq 1 30); do
            if curl -fsS http://192.168.1.103:3000/api/health >/dev/null 2>&1; then up=1; break; fi
            sleep 1
          done
          [ "$up" = "1" ] || { echo "FATAL: deployed app not responding"; exit 1; }
          echo "Health: $(curl -fsS http://192.168.1.103:3000/api/health)"
          TOKEN=$(curl -fsS -X POST http://192.168.1.103:3000/api/auth/login \
            -H 'Content-Type: application/json' \
            -d '{"username":"mike1","password":"Mypassword1"}' \
            | sed 's/.*"token":"\\([^"]*\\)".*/\\1/')
          [ -n "$TOKEN" ] || { echo "FATAL: login failed after deploy"; exit 1; }
          echo "Deploy verified: app is up and login works."
        '''
      }
    }
  }

  post {
    always {
      sh 'docker rm -f testapi-ci 2>/dev/null || true; rm -f /tmp/image-*.tgz'
    }
    success {
      echo 'Pipeline succeeded.'
    }
    failure {
      echo 'Pipeline FAILED. If this was a main-branch deploy, check the Deploy/Verify stage output on 192.168.1.103.'
    }
  }
}
