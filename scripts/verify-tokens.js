#!/usr/bin/env node

/**
 * Script to verify GitHub tokens are loaded correctly
 * Run with: node scripts/verify-tokens.js
 * 
 * Note: This script reads from .env and .env.local files directly
 */

const fs = require('fs')
const path = require('path')

// Simple env file parser
function parseEnvFile(filePath) {
  const env = {}
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8')
    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=')
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim()
        }
      }
    })
  }
  return env
}

// Load environment variables from .env.local and .env
const envLocal = parseEnvFile(path.join(__dirname, '..', '.env.local'))
const env = parseEnvFile(path.join(__dirname, '..', '.env'))
const allEnv = { ...env, ...envLocal } // .env.local overrides .env

const tokens = []
if (allEnv.GITHUB_TOKEN) {
  tokens.push({ name: 'GITHUB_TOKEN', preview: maskToken(allEnv.GITHUB_TOKEN) })
}

let i = 1
while (allEnv[`GITHUB_TOKEN_${i}`]) {
  tokens.push({ 
    name: `GITHUB_TOKEN_${i}`, 
    preview: maskToken(allEnv[`GITHUB_TOKEN_${i}`])
  })
  i++
}

function maskToken(token) {
  if (!token) return 'N/A'
  if (token.startsWith('ghp_')) {
    return `ghp_${token.substring(4, 8)}...${token.substring(token.length - 4)}`
  } else if (token.startsWith('github_pat_')) {
    return `github_pat_${token.substring(11, 15)}...${token.substring(token.length - 4)}`
  }
  return '***'
}

console.log('\n🔍 GitHub Token Verification\n')
console.log('=' .repeat(50))

if (tokens.length === 0) {
  console.log('❌ No GitHub tokens found!')
  console.log('\nTo add tokens, add them to your .env.local file:')
  console.log('  GITHUB_TOKEN=ghp_your_token_here')
  console.log('  GITHUB_TOKEN_1=ghp_another_token')
  console.log('  GITHUB_TOKEN_2=ghp_yet_another_token')
  process.exit(1)
}

console.log(`✅ Found ${tokens.length} token(s):\n`)
tokens.forEach((token, index) => {
  console.log(`  ${index + 1}. ${token.name.padEnd(20)} ${token.preview}`)
})

console.log('\n' + '='.repeat(50))
console.log(`\n📊 Rate Limit Information:`)
console.log(`   • Without tokens: 60 requests/hour`)
console.log(`   • With ${tokens.length} token(s): ${5000 * tokens.length} GitHub API requests/hour`)
console.log(`   • Endpoint limit: ${Math.min(100 * tokens.length, 500)} requests/hour`)
console.log('\n✅ Tokens are configured correctly!')
console.log('   The app will automatically rotate between all tokens.\n')
