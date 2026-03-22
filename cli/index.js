#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ─── Version from package.json ─── */
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

/* ─── Constants ─── */
const REPO_URL = 'https://github.com/ravin972/voxly-backend.git';
const CLEANUP_DIRS = ['cli', '.github', 'docs', 'scripts', 'nginx'];

// Restrict PATH to known-safe OS directories — prevents PATH injection attacks
// where a malicious directory earlier in PATH could shadow system binaries
const SAFE_PATH = process.platform === 'win32'
    ? 'C:\\Windows\\System32;C:\\Windows;C:\\Program Files\\Git\\cmd'
    : '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const CLEANUP_FILES = [
    'AI-chat-service.md', 'docker setup.md', 'frontend.md',
    'implementation_plan.md', 'plan.md', 'system_design.md',
    'technical_deepdive.md', 'voxly_app_icon_1770888358855.png',
];

/* ─── Banner ─── */
const banner = `
${chalk.bold.hex('#8b5cf6')('╔══════════════════════════════════════════╗')}
${chalk.bold.hex('#8b5cf6')('║')}  ${chalk.bold.white('🚀 Voxly')} ${chalk.dim(`v${pkg.version}`)}                        ${chalk.bold.hex('#8b5cf6')('║')}
${chalk.bold.hex('#8b5cf6')('║')}  ${chalk.dim('AI-powered client communication')}          ${chalk.bold.hex('#8b5cf6')('║')}
${chalk.bold.hex('#8b5cf6')('║')}  ${chalk.dim('via WhatsApp + GitHub')}                    ${chalk.bold.hex('#8b5cf6')('║')}
${chalk.bold.hex('#8b5cf6')('╚══════════════════════════════════════════╝')}
`;

/* ─── Helpers ─── */
function generateSecret(length = 64) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function commandExists(cmd) {
    // Use execFileSync with an args array — no shell interpolation, no injection risk
    // Pass explicit safe PATH env to prevent PATH-based injection
    const checker = process.platform === 'win32' ? 'where' : 'which';
    try {
        execFileSync(checker, [cmd], { stdio: 'ignore', env: { PATH: SAFE_PATH } });
        return true;
    } catch {
        return false;
    }
}

function runCmd(cmd, cwd, label) {
    // Split command into [file, ...args] so no shell is spawned (shell: false)
    // Pass explicit safe PATH env to prevent PATH-based injection
    const [file, ...args] = cmd.split(' ');
    return new Promise((resolve, reject) => {
        const child = spawn(file, args, { cwd, shell: false, stdio: 'pipe', env: { ...process.env, PATH: SAFE_PATH } });
        let stderr = '';
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('close', (code) => {
            if (code !== 0) reject(new Error(`${label} failed: ${stderr}`));
            else resolve();
        });
    });
}

function rmSafe(target) {
    try {
        if (fs.existsSync(target)) {
            fs.rmSync(target, { recursive: true, force: true });
        }
    } catch { /* ignore */ }
}

/* ─── Prompts ─── */
async function getConfig() {
    console.log(chalk.dim('\nAnswer the following to configure your Voxly instance.\n'));
    console.log(chalk.dim('Press Enter to accept defaults shown in parentheses.\n'));

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'dbUrl',
            message: chalk.cyan('PostgreSQL URL:'),
            default: 'postgresql://postgres:postgres@localhost:5432/voxly',
        },
        {
            type: 'input',
            name: 'redisUrl',
            message: chalk.cyan('Redis URL:'),
            default: 'redis://localhost:6379',
        },
        {
            type: 'password',
            name: 'jwtSecret',
            message: chalk.cyan('JWT Secret (auto-generated if empty):'),
            default: '',
        },
        {
            type: 'input',
            name: 'anthropicKey',
            message: chalk.cyan('Anthropic API Key (optional, add later):'),
            default: '',
        },
        {
            type: 'input',
            name: 'githubToken',
            message: chalk.cyan('GitHub Token (optional, add later):'),
            default: '',
        },
        {
            type: 'input',
            name: 'twilioSid',
            message: chalk.cyan('Twilio Account SID (optional):'),
            default: '',
        },
        {
            type: 'input',
            name: 'twilioToken',
            message: chalk.cyan('Twilio Auth Token (optional):'),
            default: '',
        },
        {
            type: 'input',
            name: 'twilioWhatsApp',
            message: chalk.cyan('Twilio WhatsApp Number (optional):'),
            default: 'whatsapp:+14155238886',
        },
        {
            type: 'input',
            name: 'openaiKey',
            message: chalk.cyan('OpenAI API Key (optional):'),
            default: '',
        },
        {
            type: 'input',
            name: 'geminiKey',
            message: chalk.cyan('Gemini API Key (optional):'),
            default: '',
        },
        {
            type: 'confirm',
            name: 'useDocker',
            message: chalk.cyan('Use Docker Compose for services (Postgres + Redis)?'),
            default: false,
        },
    ]);

    // Auto-generate JWT secret if empty
    if (!answers.jwtSecret) {
        answers.jwtSecret = generateSecret();
    }

    return answers;
}

/* ─── Scaffold ─── */
async function scaffold(targetDir, config, options) {
    const spinner = ora();

    // 1. Check git is available
    if (!commandExists('git')) {
        console.log(chalk.red('\n❌ Git is required but not found.'));
        console.log(chalk.dim('   Install from https://git-scm.com'));
        process.exit(1);
    }

    // 2. Clone repository (shallow — fast!)
    spinner.start(chalk.dim('Cloning Voxly from GitHub (this may take a moment)...'));
    try {
        // Use spawnSync with explicit args array — no shell, no injection risk
        // Pass explicit safe PATH to prevent PATH-based injection
        const result = spawnSync(
            'git',
            ['clone', '--depth', '1', REPO_URL, targetDir],
            { stdio: 'pipe', encoding: 'utf8', env: { PATH: SAFE_PATH } }
        );
        if (result.status !== 0) throw new Error(result.stderr || 'git clone failed');
        spinner.succeed(chalk.green('Repository cloned'));
    } catch (err) {
        spinner.fail(chalk.red('Failed to clone repository'));
        console.log(chalk.dim(err.message));
        process.exit(1);
    }

    // 3. Clean up — remove .git, cli, docs, internal files
    spinner.start(chalk.dim('Cleaning up internal files...'));
    rmSafe(path.join(targetDir, '.git'));
    for (const dir of CLEANUP_DIRS) rmSafe(path.join(targetDir, dir));
    for (const file of CLEANUP_FILES) rmSafe(path.join(targetDir, file));
    spinner.succeed(chalk.green('Project cleaned'));

    // 4. Initialize fresh git repo
    spinner.start(chalk.dim('Initializing fresh git repo...'));
    try {
        execSync('git init', { cwd: targetDir, stdio: 'pipe' });
        spinner.succeed(chalk.green('Git repo initialized'));
    } catch {
        spinner.warn(chalk.yellow('Could not initialize git repo'));
    }

    // 5. Generate .env files
    spinner.start(chalk.dim('Generating environment files...'));
    const backendEnv = `# ─── Database ───
DATABASE_URL=${config.dbUrl}

# ─── JWT ───
SECRET_KEY=${config.jwtSecret}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ─── AI Providers ───
ANTHROPIC_API_KEY=${config.anthropicKey || ''}
OPENAI_API_KEY=${config.openaiKey || ''}
GEMINI_API_KEY=${config.geminiKey || ''}

# ─── GitHub ───
GITHUB_TOKEN=${config.githubToken || ''}

# ─── WhatsApp (Twilio) ───
TWILIO_ACCOUNT_SID=${config.twilioSid || ''}
TWILIO_AUTH_TOKEN=${config.twilioToken || ''}
TWILIO_WHATSAPP_NUMBER=${config.twilioWhatsApp}

# ─── Redis ───
REDIS_URL=${config.redisUrl}

# ─── App ───
DEBUG=true
`;

    const frontendEnv = `NEXT_PUBLIC_API_URL=http://localhost:8000
`;

    fs.writeFileSync(path.join(targetDir, 'backend', '.env'), backendEnv);
    fs.writeFileSync(path.join(targetDir, 'frontend', '.env'), frontendEnv);
    spinner.succeed(chalk.green('Environment files generated'));

    // 6. Install dependencies (unless --skip-install or Docker mode)
    if (options.skipInstall || config.useDocker) {
        if (config.useDocker) {
            spinner.info(chalk.blue('Docker mode — skipping local dependency installation'));
            spinner.info(chalk.blue(`Run: cd ${path.basename(targetDir)} && docker compose up`));
        } else {
            spinner.info(chalk.blue('Skipping dependency installation (--skip-install)'));
        }
        return;
    }

    // Frontend
    const hasNode = commandExists('node');
    if (!hasNode) {
        spinner.warn(chalk.yellow('Node.js not found — skipping frontend install. Install from https://nodejs.org'));
    } else {
        spinner.start(chalk.dim('Installing frontend dependencies...'));
        try {
            await runCmd('npm install', path.join(targetDir, 'frontend'), 'npm install');
            spinner.succeed(chalk.green('Frontend dependencies installed'));
        } catch (e) {
            spinner.fail(chalk.red('Frontend install failed: ' + e.message));
        }
    }

    // Backend
    const hasPython = commandExists('python') || commandExists('python3');
    const hasPip = commandExists('pip') || commandExists('pip3');
    if (!hasPython || !hasPip) {
        spinner.warn(chalk.yellow('Python/pip not found — skipping backend install. Install Python 3.12+'));
    } else {
        spinner.start(chalk.dim('Installing backend dependencies...'));
        const pipCmd = commandExists('pip3') ? 'pip3' : 'pip';
        try {
            await runCmd(`${pipCmd} install -r requirements.txt`, path.join(targetDir, 'backend'), 'pip install');
            spinner.succeed(chalk.green('Backend dependencies installed'));
        } catch (e) {
            spinner.fail(chalk.red('Backend install failed: ' + e.message));
        }
    }

    // 7. Run migrations (if DB is accessible)
    spinner.start(chalk.dim('Running database migrations...'));
    try {
        await runCmd('alembic upgrade head', path.join(targetDir, 'backend'), 'alembic');
        spinner.succeed(chalk.green('Database migrations complete'));
    } catch {
        spinner.warn(chalk.yellow('Migrations skipped — ensure database is running and run: cd backend && alembic upgrade head'));
    }
}

/* ─── Success Banner ─── */
function printSuccess(projectName) {
    console.log(`
${chalk.green.bold('✅ Voxly is ready!')}

${chalk.dim('──────────────────────────────────────')}

  ${chalk.bold('Start the backend:')}
  ${chalk.cyan(`cd ${projectName}/backend`)}
  ${chalk.cyan('uvicorn app.main:app --reload')}

  ${chalk.bold('Start the frontend:')}
  ${chalk.cyan(`cd ${projectName}/frontend`)}
  ${chalk.cyan('npm run dev')}

  ${chalk.bold('Or use Docker:')}
  ${chalk.cyan(`cd ${projectName}`)}
  ${chalk.cyan('docker compose up')}

${chalk.dim('──────────────────────────────────────')}

  ${chalk.dim('Frontend:')}  ${chalk.underline('http://localhost:3001')}
  ${chalk.dim('Backend:')}   ${chalk.underline('http://localhost:8000')}
  ${chalk.dim('API Docs:')} ${chalk.underline('http://localhost:8000/docs')}

${chalk.dim('──────────────────────────────────────')}

  ${chalk.hex('#8b5cf6')('⭐ Star us on GitHub: https://github.com/ravin972/voxly')}
  ${chalk.dim('📖 Docs: https://voxly.dev/docs')}
`);
}

/* ─── Main CLI ─── */
const program = new Command();

program
    .name('create-voxly')
    .description('Scaffold a new Voxly instance — AI-powered client communication')
    .version(pkg.version)
    .argument('[directory]', 'Target directory name', 'voxly')
    .option('--docker', 'Use Docker Compose mode')
    .option('--skip-install', 'Skip dependency installation')
    .action(async (directory, options) => {
        console.log(banner);

        const targetDir = path.resolve(process.cwd(), directory);

        // Check if directory already exists
        if (fs.existsSync(targetDir)) {
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: chalk.yellow(`Directory "${directory}" already exists. Overwrite?`),
                    default: false,
                },
            ]);
            if (!overwrite) {
                console.log(chalk.red('Aborted.'));
                process.exit(1);
            }
            fs.rmSync(targetDir, { recursive: true, force: true });
        }

        const config = await getConfig();
        if (options.docker) config.useDocker = true;

        await scaffold(targetDir, config, options);

        printSuccess(directory);
    });

program.parse();
