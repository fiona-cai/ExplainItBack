# ExplainItBack

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
- `GITHUB_TOKEN`: Optional GitHub personal access token for higher rate limits (public repos work without it)
