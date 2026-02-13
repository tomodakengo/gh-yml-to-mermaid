export interface SampleWorkflow {
  name: string;
  description: string;
  yaml: string;
}

export const sampleWorkflows: SampleWorkflow[] = [
  {
    name: 'Basic CI',
    description: 'Basic CI workflow with build and test (with conditional steps)',
    yaml: `name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Upload coverage
        if: github.event_name == 'push'
        run: bash <(curl -s https://codecov.io/bash)

  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
`,
  },
  {
    name: 'CI/CD Pipeline',
    description: 'Full pipeline with build, test, and deploy',
    yaml: `name: CI/CD Pipeline
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
      - name: Install
        run: npm ci
      - name: Lint
        run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
      - name: Install
        run: npm ci
      - name: Unit Tests
        run: npm test
      - name: E2E Tests
        run: npm run test:e2e

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: npm run build
      - name: Upload artifact
        uses: actions/upload-artifact@v4

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
      - name: Deploy to staging
        run: ./deploy.sh staging

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
      - name: Deploy to production
        run: ./deploy.sh production
`,
  },
  {
    name: 'Matrix Build',
    description: 'Matrix build across multiple OS and versions',
    yaml: `name: Matrix Build
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1'

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - name: Install
        run: npm ci
      - name: Test
        run: npm test

  publish:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
      - name: Install
        run: npm ci
      - name: Build
        run: npm run build
      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`,
  },
  {
    name: 'Docker Build & Push',
    description: 'Build Docker image and push to registry',
    yaml: `name: Docker Build
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: npm test

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Login to DockerHub
        uses: docker/login-action@v3
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to Kubernetes
        run: kubectl apply -f k8s/
`,
  },
];
