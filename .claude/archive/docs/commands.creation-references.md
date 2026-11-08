# Command Patterns: Complete Development Workflows

This folder contains fundamental command patterns that form complete AI-assisted development workflows. These commands represent the essential stages of development tasks and are designed to work together as cohesive systems.

## Folder Structure

```
3_command_patterns/
├── README.md                     # This file
├── core_commands/                # The 4 core development commands
│   ├── prime.md                  # Context loading
│   ├── planning.md               # Feature planning
│   ├── execute.md                # Implementation
│   └── commit.md                 # Git commits
└── alternative_workflow/         # Bug investigation & fix workflow
    ├── rca.md                    # Root cause analysis
    ├── implement-fix.md          # Fix implementation
    └── commit.md                 # Git commits
```

---

## The INPUT → PROCESS → OUTPUT Mental Model

**Every command in this folder follows the same fundamental structure:**

1. **INPUT** - What context does the agent need?
2. **PROCESS** - What steps should the agent follow?
3. **OUTPUT** - What format should the result take?

This mental model is the core pattern guiding every slash command. While the commands here don't explicitly label these sections (unlike the example in `module_4/2_command_structure/command-example.md`), they still follow this structure.

For a detailed explanation of this framework, see `module_4/2_command_structure/README.md`.

---

## Why These Are The Core 4

These commands map to the natural flow of software development:

1. **Understand** the codebase (prime)
2. **Plan** what to build (planning)
3. **Implement** the plan (execute)
4. **Save** the work (commit)

Every feature, fix, or enhancement follows this pattern. By codifying these stages as reusable commands, you create a systematic, repeatable development workflow.

---

## The Core 4 Command Patterns

All commands are located in the `core_commands/` folder.

### 1. `prime.md` - Context Loading Pattern

**Purpose**: Build comprehensive codebase understanding

**What it produces**: Agent state loaded with project context

**Consumer**: YOU (to verify understanding) and THE AGENT (to inform future actions)

**When to use**:

- Start of new session
- Switching between projects
- Before major changes
- When agent needs project refresh

**Key characteristics**:

- Uses bash execution (`!`) to gather project info
- Reads documentation and key files
- Produces human-readable summary
- Optimized for scanning and verification

**Command**: `/prime`

---

### 2. `planning.md` - Document Creation Pattern

**Purpose**: Research and create detailed implementation plans

**What it produces**: Markdown document with step-by-step tasks

**Consumer**: ANOTHER AGENT (the execute command) and YOU (to review/refine)

**When to use**:

- Before implementing new features
- For complex changes requiring research
- When you need a reviewable plan
- To separate thinking from doing

**Key characteristics**:

- Takes feature name as argument
- Saves plan to `plans/` directory
- Formats output for agent consumption
- Includes exact file paths and commands
- Can be refined before execution

**Command**: `/planning feature-name`

---

### 3. `execute.md` - Implementation Pattern

**Purpose**: Implement features from detailed plans

**What it produces**: Code implementation, tests, and validation results

**Consumer**: YOU (the implemented feature) and GIT (via commit)

**When to use**:

- After creating a plan with `/planning`
- When you have a clear specification to implement
- For systematic feature implementation
- To ensure all validation steps are followed

**Key characteristics**:

- Reads plan file from `plans/` directory
- Executes every task in order
- Runs all validation commands
- Produces confirmation of completion
- Separates implementation from planning

**Command**: `/execute feature-name`

---

### 4. `commit.md` - Action Automation Pattern

**Purpose**: Create well-formatted git commits

**What it produces**: Git commit with conventional message format

**Consumer**: GIT (version control system) and YOUR TEAM (via git history)

**When to use**:

- After completing implementation
- After any code changes you want to save
- To maintain clean commit history
- For consistent commit message format

**Key characteristics**:

- Reviews changes with git diff
- Analyzes changes to determine commit type
- Creates conventional commit message
- Stages and commits changes
- Reports commit details

**Command**: `/commit` or `/commit file1.py file2.py`

---

## The Complete Development Lifecycle

These four commands chain together to form a complete workflow:

```
┌─────────────────────────────────────────────────────────┐
│                    DEVELOPMENT CYCLE                    │
└─────────────────────────────────────────────────────────┘

1. /prime
   ↓
   Understands: Project structure, conventions, current state
   Output: Agent loaded with context

2. /planning authentication-system
   ↓
   Researches: Existing patterns, best practices
   Output: plans/authentication-system.md

3. /execute authentication-system
   ↓
   Implements: Reads plan, codes features, creates tests
   Output: Working implementation, passing tests

4. /commit
   ↓
   Commits: Creates conventional commit message
   Output: Git commit saved

┌─────────────────────────────────────────────────────────┐
│                    READY FOR NEXT CYCLE                 │
└─────────────────────────────────────────────────────────┘
```

---

## Why This Design Works

### Separation of Concerns

**Planning vs Execution**: Research and implementation are separate mental modes. Planning requires exploration and thinking. Execution requires focus and precision.

**Context vs Action**: Understanding (prime) is separate from building (execute). Clear context enables better implementation.

**One Job Per Command**: Each command has a clear, focused purpose. This makes them more reusable and easier to refine.

### Intelligence Reuse

**Plans are artifacts**: The plan document captures research once and can be:

- Executed multiple times (if something fails)
- Reviewed and refined before execution
- Referenced in future similar tasks
- Shared with team members

**Context is captured**: Priming creates explicit understanding that can be:

- Verified before proceeding
- Referenced during implementation
- Updated as project evolves

### Agent-to-Agent Communication

**Planning → Execute chain**: The planning command knows its output will be consumed by the execute command. It optimizes for:

- Explicit file paths
- Exact validation commands
- No ambiguity
- Complete specifications

**Prime → Everything**: The prime command loads context that benefits all future commands in the session.

### Workflow Flexibility

**Commands work independently**:

- Can prime without planning
- Can commit without executing
- Can plan without executing
- Can execute any existing plan

**Commands chain flexibly**:

- Skip planning for small changes
- Plan multiple features before executing any
- Execute same plan multiple times
- Commit incremental progress

---

## Command Patterns Summary

| Command    | Pattern           | Produces            | Consumer      | Reusable      |
| ---------- | ----------------- | ------------------- | ------------- | ------------- |
| `prime`    | Context Loading   | Agent Understanding | Human + Agent | Every session |
| `planning` | Document Creation | Plan Document       | Another Agent | Per feature   |
| `execute`  | Implementation    | Code + Tests        | Human + Git   | Per plan      |
| `commit`   | Action Automation | Git Commit          | Git + Team    | After changes |

---

## Getting Started

### Recommended Order for First Use

1. **Start with `/prime`** to understand your codebase
2. **Try `/commit`** for your next commit (simpler to verify)
3. **Use `/planning` and `/execute`** together for your next feature
4. **Refine** each command based on your experience

### Evolution Path

These commands will improve over time:

**Version 1**: Basic commands following the templates here

**Version 2**: Add project-specific context and patterns

**Version 3**: Optimize output formats based on usage

**Version 4**: Add integrations with your specific tools and workflows

### Tips for Success

1. **Verify prime output**: Always check the summary to ensure agent understanding
2. **Review plans before executing**: Catch issues early, refine as needed
3. **Refine based on use (evolve your system)**: Update commands when you notice gaps
4. **Add project specifics**: Customize for your tech stack and conventions
5. **Share with team**: Project commands in `.claude/commands/` benefit everyone

---

## Alternative Workflow: Bug Investigation & Fix

While the Core 4 represent the main development cycle, here's an alternative workflow for bug fixing.

### Prerequisites: GitHub CLI Setup

The RCA and implement-fix commands integrate with GitHub to fetch issue details automatically. Before using these commands, ensure GitHub CLI is installed and authenticated:

#### Install GitHub CLI

**macOS:**

```bash
brew install gh
```

**Windows:**

```bash
winget install --id GitHub.cli
```

**Linux:**

```bash
# Debian/Ubuntu
sudo apt install gh

# Fedora/RHEL
sudo dnf install gh
```

#### Authenticate with GitHub

Run the following command and follow the prompts:

```bash
gh auth login
```

Choose:

- GitHub.com (or your GitHub Enterprise instance)
- HTTPS or SSH (your preference)
- Authenticate via browser or token

#### Verify Setup

Confirm authentication:

```bash
gh auth status
```

You should see: `✓ Logged in to github.com as [your-username]`

#### Test in Your Repository

Navigate to your local Git repository (that's connected to a GitHub origin) and test:

```bash
gh issue list
```

This should display issues from your GitHub repository. If you see issues listed, you're ready to use the RCA and implement-fix commands.

**Important:** These commands assume you're working in a local Git repository that has a GitHub remote origin. The issue IDs referenced in commands are GitHub issue IDs from that repository.

---

### The Bug Fix Commands

All commands are located in the `alternative_workflow/` folder.

### 5. `rca.md` - Root Cause Analysis Pattern

**Purpose**: Investigate GitHub issues and document root cause analysis

**What it produces**: RCA document with findings and fix approach

**Consumer**: ANOTHER AGENT (implement-fix command) and YOU (to review)

**When to use**:

- Investigating reported bugs from GitHub issues
- Understanding production issues
- Documenting complex problems
- Before implementing fixes

**Key characteristics**:

- Takes GitHub issue ID as argument
- Uses GitHub CLI to fetch issue details
- Investigates code and git history
- Documents root cause and impact
- Proposes fix strategy
- Saves to `docs/rca/` directory

**Command**: `/rca 123` (where 123 is a GitHub issue ID)

### 6. `implement-fix.md` - Fix Implementation Pattern

**Purpose**: Implement fixes from RCA documents for GitHub issues

**What it produces**: Bug fix with tests and validation

**Consumer**: GIT (via commit)

**When to use**:

- After completing RCA for a GitHub issue
- When fix approach is documented
- For systematic bug resolution

**Key characteristics**:

- Takes GitHub issue ID as argument
- Reads RCA document for that issue
- Implements proposed fix
- Adds regression tests
- Validates all changes
- Reports completion

**Command**: `/implement-fix 123` (where 123 is the GitHub issue ID from RCA)

### Bug Fix Workflow Chain

```
┌─────────────────────────────────────────────────────────┐
│                    BUG FIX CYCLE                        │
└─────────────────────────────────────────────────────────┘

1. /prime
   ↓
   Understands: Project context

2. /rca 123
   ↓
   Fetches: GitHub issue #123 details via gh CLI
   Investigates: Root cause, impact, fix approach
   Output: docs/rca/issue-123.md

3. /implement-fix 123
   ↓
   Implements: Reads RCA, fixes bug, adds tests
   Output: Working fix, passing tests

4. /commit
   ↓
   Commits: Creates fix commit referencing GitHub issue
   Output: Git commit saved with "Fixes #123"

┌─────────────────────────────────────────────────────────┐
│                    ISSUE RESOLVED                       │
└─────────────────────────────────────────────────────────┘
```

**Why RCA + Fix pattern?**

- **Separation**: Investigation separate from implementation
- **Documentation**: RCA captures knowledge for future
- **Review**: Can review analysis before coding
- **Reusable**: Same RCA can inform multiple attempts

---

## Beyond These 6

Once you're comfortable with these foundational commands, you can:

- **Add specialized commands** for your domain (database migrations, API endpoints, etc.)
- **Create command variants** to fit to your use case(s)
- **Build new workflows** by chaining these with other commands
- **Customize for your stack** (add tool-specific steps)

But these six represent the essential patterns that apply to almost every codebase and task.

---

## The Big Picture

These aren't just "helper scripts" or "prompt shortcuts."

They're a **systematic approach to AI driven development** that:

- Codifies best practices as reusable processes
- Separates concerns for clearer thinking
- Creates artifacts that compound learning
- Enables reliable, repeatable workflows
- Standardizes team development processes

Master these four, and you have a foundation for building reliable and repeatable systems for working with AI coding assistants.
