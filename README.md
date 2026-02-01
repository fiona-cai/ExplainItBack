# ExplainItBack
Turn your GitHub repo into resume-ready bullets, interview pitches, and AI-powered technical interview practice with deep-dive sessions.

---

A minimal web app that transforms raw project descriptions into:
- Clear technical explanations (5-7 sentences)
- Resume-ready bullets
- 30-second interview pitches

## Features

- **Text Input**: Paste your raw project description directly
- **GitHub Integration**: Paste a GitHub repository URL to automatically fetch README and repository information
- **File Upload**: Upload a ZIP file of your project to extract and analyze project files

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your OpenAI API key:
```bash
# Create a .env.local file
echo "OPENAI_API_KEY=your_api_key_here" > .env.local
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **OpenAI API** (gpt-4o-mini)
- **GitHub API** (@octokit/rest) - for fetching repository information
- **JSZip** - for extracting project files from ZIP uploads

## Architecture

- **Single API Route**: `/app/api/explain/route.ts`
  - Handles POST requests with project description, audience, and tone
  - Supports three input methods:
    - **Text**: Direct project description input
    - **GitHub**: Fetches README, package.json, and repository metadata from GitHub
    - **Upload**: Extracts project information from uploaded ZIP files
  - Uses structured prompts to ensure accurate, non-hallucinated outputs
  - Returns JSON with three fields: technicalExplanation, resumeBullet, interviewPitch

- **Single Page**: `/app/page.tsx`
  - Client component with tabbed interface for different input methods
  - Three output cards with copy-to-clipboard functionality
  - Loading and error states
  - File upload with drag-and-drop support

## Key Design Decisions

1. **Prompt Engineering**: 
   - System prompt frames the model as an expert technical communicator
   - Explicit constraints against hallucination and fluff
   - Audience and tone adaptation built into the prompt

2. **JSON Response Format**: 
   - Uses `response_format: { type: 'json_object' }` for structured output
   - Validates response structure before returning

3. **Error Handling**:
   - Validates input on both client and server
   - Handles API key errors gracefully
   - User-friendly error messages

4. **UI/UX**:
   - Minimal, clean design with Tailwind CSS
   - Loading spinner during generation
   - Copy-to-clipboard with visual feedback
   - Responsive layout for mobile and desktop

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- **Redis (optional):** Session storage defaults to in-memory, so the app runs without Redis. To use Redis (e.g. for production or multi-instance), set `USE_REDIS=true` and configure `REDIS_HOST`, `REDIS_PORT`, and optionally `REDIS_PASSWORD`.
- `GITHUB_TOKEN`: Optional GitHub personal access token for higher rate limits (public repos work without it)
- `GITHUB_TOKEN_1`, `GITHUB_TOKEN_2`, etc.: Additional GitHub tokens for higher rate limits
- `RATE_LIMIT_PER_USER`: Per-user rate limit (default: 10 requests/hour)
- `EXPECTED_USERS_PER_HOUR`: Expected traffic for rate limit calculation (default: 500)
- `AVG_REQUESTS_PER_USER`: Average requests per user (default: 2.0)
- `BURST_FACTOR`: Burst traffic multiplier (default: 1.5)

### Getting a GitHub Personal Access Token

To increase your GitHub API rate limit from 60/hour to 5,000/hour:

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a descriptive name (e.g., "ExplainItBack")
4. Select scopes:
   - ✅ `public_repo` (to read public repositories)
   - ✅ `repo` (if you need private repos)
5. Click "Generate token"
6. Copy the token (starts with `ghp_`)
7. Add it to your `.env.local` file:
   ```bash
   GITHUB_TOKEN=ghp_your_token_here
   ```

**Note:** Fine-grained tokens also work. They start with `github_pat_` and offer more granular permissions.

### Using Multiple Tokens (Higher Limits)

You can use multiple tokens to effectively increase your rate limit. The app will automatically rotate between them:

```bash
GITHUB_TOKEN=ghp_token1

# Multiple tokens (5,000/hour × number of tokens)
GITHUB_TOKEN=ghp_token1
GITHUB_TOKEN_1=ghp_token2
GITHUB_TOKEN_2=ghp_token3
# ... up to GITHUB_TOKEN_N
```

**Example:** With 3 tokens, you effectively get 15,000 requests/hour (3 × 5,000).

### Rate Limits

- **Without token**: 60 requests/hour
- **With 1 Personal Access Token**: 5,000 requests/hour
- **With N tokens**: 5,000 × N requests/hour (automatically rotated)
- **With GitHub App**: 15,000 requests/hour (advanced setup, requires app installation)
