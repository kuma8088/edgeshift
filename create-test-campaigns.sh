#!/bin/bash

# Script to create test campaigns in production
# Usage: ADMIN_API_KEY=your-key ./create-test-campaigns.sh

if [ -z "$ADMIN_API_KEY" ]; then
  echo "Error: ADMIN_API_KEY environment variable is required"
  echo "Usage: ADMIN_API_KEY=your-key ./create-test-campaigns.sh"
  exit 1
fi

API_URL="https://edgeshift.tech/api"

echo "Creating test campaigns..."

# Campaign 1: Getting Started with Cloudflare Workers
echo -n "Creating campaign 1... "
curl -s -X POST "$API_URL/campaigns" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Getting Started with Cloudflare Workers",
    "content": "<h1>Getting Started with Cloudflare Workers</h1>\n<p>Cloudflare Workers is a serverless platform that lets you deploy code globally. In this article, we will explore the basics of Workers and how to get started.</p>\n<h2>What are Workers?</h2>\n<p>Workers are JavaScript functions that run on Cloudflares edge network. They can intercept and modify HTTP requests and responses.</p>\n<h2>Key Benefits</h2>\n<ul><li>Global deployment in seconds</li><li>Zero cold starts</li><li>Pay-per-request pricing</li></ul>",
    "slug": "getting-started-cloudflare-workers",
    "excerpt": "Learn the basics of Cloudflare Workers and how to deploy your first serverless function on the edge.",
    "is_published": 1,
    "status": "sent"
  }' | jq -r '.success'

# Campaign 2: Building a Newsletter System with D1
echo -n "Creating campaign 2... "
curl -s -X POST "$API_URL/campaigns" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Building a Newsletter System with D1",
    "content": "<h1>Building a Newsletter System with D1</h1>\n<p>Cloudflare D1 is a serverless SQL database that runs on the edge. Perfect for building newsletter systems!</p>\n<h2>Architecture</h2>\n<p>Our newsletter system uses:</p>\n<ul><li>D1 for data storage</li><li>Workers for API logic</li><li>Resend for email delivery</li></ul>\n<h2>Schema Design</h2>\n<p>The key tables are subscribers, campaigns, and delivery_logs.</p>",
    "slug": "newsletter-system-with-d1",
    "excerpt": "How to build a complete newsletter system using Cloudflare D1, Workers, and Resend API.",
    "is_published": 1,
    "status": "sent"
  }' | jq -r '.success'

# Campaign 3: Advanced Email Sequences
echo -n "Creating campaign 3... "
curl -s -X POST "$API_URL/campaigns" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Advanced Email Sequences: Drip Campaigns",
    "content": "<h1>Advanced Email Sequences</h1>\n<p>Email sequences (drip campaigns) are a powerful way to nurture subscribers over time.</p>\n<h2>How They Work</h2>\n<p>Each step in a sequence has a delay. When a subscriber joins, they automatically receive emails at scheduled intervals.</p>\n<h2>Use Cases</h2>\n<ul><li>Onboarding new users</li><li>Educational content series</li><li>Product launches</li></ul>\n<h2>Implementation</h2>\n<p>We use cron triggers to check for pending sequence steps every 15 minutes.</p>",
    "slug": "advanced-email-sequences",
    "excerpt": "Master email sequences to create automated drip campaigns that engage subscribers over time.",
    "is_published": 1,
    "status": "sent"
  }' | jq -r '.success'

echo ""
echo "Test campaigns created!"
echo "View them at: https://edgeshift.tech/newsletter/archive"
