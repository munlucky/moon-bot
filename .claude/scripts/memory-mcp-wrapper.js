#!/usr/bin/env node

/**
 * Memory MCP Wrapper
 * 현재 작업 디렉토리 기준으로 memory.json 경로를 동적으로 설정하고
 * @modelcontextprotocol/server-memory를 실행합니다.
 * 
 * Mac/Windows/Linux 모두 호환
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 현재 작업 디렉토리 기준 memory.json 경로
const cwd = process.cwd();
const memoryFilePath = path.join(cwd, '.claude', 'memory.json');

// .claude 디렉토리가 없으면 생성
const claudeDir = path.join(cwd, '.claude');
if (!fs.existsSync(claudeDir)) {
  fs.mkdirSync(claudeDir, { recursive: true });
}

// memory.json 파일이 없으면 초기화
if (!fs.existsSync(memoryFilePath)) {
  fs.writeFileSync(memoryFilePath, JSON.stringify({ entities: [], relations: [] }, null, 2));
  console.error(`Created: ${memoryFilePath}`);
}

// 환경변수 설정
process.env.MEMORY_FILE_PATH = memoryFilePath;

// npx로 memory server 실행
const isWindows = process.platform === 'win32';

const child = spawn('npx', ['-y', '@modelcontextprotocol/server-memory'], {
  stdio: 'inherit',
  env: process.env,
  shell: isWindows  // Windows에서는 shell을 통해 실행해야 함
});

child.on('error', (err) => {
  console.error('Failed to start memory server:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
