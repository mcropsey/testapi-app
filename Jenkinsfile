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
              | sed 's/.*"token":"\([^"]*\)".*/\1/')
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

    stage('Deploy') {
      steps {
        script {
          def tag = env.IMAGE_TAG
          echo "Deploying ${APP}:${tag} to ${DEPLOY}"
          sh "docker save ${APP}:${tag} | gzip > /tmp/image-${tag}.tgz"
          sh "scp -o StrictHostKeyChecking=accept-new /tmp/image-${tag}.tgz ${DEPLOY}:/tmp/"
          sh """
            ssh -o StrictHostKeyChecking=accept-new ${DEPLOY} '
              set -e
              echo "Loading image on podman host..."
              podman load < /tmp/image-${tag}.tgz
              rm -f /tmp/image-${tag}.tgz
              echo "Replacing container (data volume is kept)..."
              podman rm -f testapi-app 2>/dev/null || true
              podman run -d --name testapi-app --restart unless-stopped \\
                -p 3000:3000 -v testapi-app-data:/app/data localhost/testapi-app:${tag}
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
