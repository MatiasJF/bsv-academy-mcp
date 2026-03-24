# BSV Academy MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with complete access to the BSV Academy knowledge base from [hub.bsvblockchain.org](https://hub.bsvblockchain.org/bsv-academy).

## What it does

This MCP server scrapes and indexes all BSV Academy courses, making the content searchable and queryable by any MCP-compatible AI assistant (Claude Code, Claude Desktop, etc.).

**Courses covered:**
- BSV Basics: Protocol and Design
- BSV Infrastructure
- BSV Network Topology
- Introduction to Bitcoin Script
- Bitcoin Primitives (Hash Functions, Merkle Trees, Digital Signatures)
- Bitcoin as Historical Phenomenon
- Bitcoin Whitepaper Series
- Deep Dive in BSV Blockchain
- Identity and Privacy Foundations
- Introduction to Blockchain Technology
- And more...

## Setup

### 1. Install dependencies

```bash
git clone https://github.com/MatiasJF/bsv-academy-mcp.git
cd bsv-academy-mcp
npm install
```

### 2. Build the knowledge base

Scrape BSV Academy and build the local knowledge base:

```bash
npm run scrape
```

This crawls all courses recursively and saves structured content to `data/knowledge-base.json`.

### 3. Add to Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "bsv-academy": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/path/to/bsv-academy-mcp"
    }
  }
}
```

Or add to Claude Desktop's config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bsv-academy": {
      "command": "node",
      "args": ["/path/to/bsv-academy-mcp/dist/server.js"]
    }
  }
}
```

For Claude Desktop, build first: `npm run build`

## Available Tools

| Tool | Description |
|------|-------------|
| `bsv_list_courses` | List all courses with chapters and section counts |
| `bsv_get_course` | Get detailed content from a specific course, chapter, or section |
| `bsv_search` | Search across all content by keyword or phrase |
| `bsv_get_concepts` | Get extracted concepts and key terms for quiz generation |
| `bsv_get_page` | Get content of a specific page by URL |
| `bsv_stats` | Get knowledge base statistics |
| `bsv_refresh_kb` | Re-scrape BSV Academy and rebuild the knowledge base |

## Usage Examples

Once connected, ask your AI assistant:

- "What courses are available in BSV Academy?"
- "Search for information about Merkle Trees"
- "Get the key concepts from the Bitcoin Script course"
- "What does BSV Academy teach about digital signatures?"
- "Generate trivia questions based on the hash functions course"

## Development

```bash
npm run dev     # Run server in development mode
npm run scrape  # Rebuild knowledge base
npm run build   # Compile TypeScript
```

## License

MIT
