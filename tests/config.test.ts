import { describe, expect, it } from 'vitest';
import { loadConfig, missingRedditConfig } from '../src/config/env.js';

describe('configuration', () => {
  it('uses safe local defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.redditMaxRetries).toBe(2);
    expect(missingRedditConfig(config)).toEqual([
      'REDDIT_CLIENT_ID',
      'REDDIT_CLIENT_SECRET',
      'REDDIT_USER_AGENT'
    ]);
  });

  it('parses allowlists and Reddit configuration', () => {
    const config = loadConfig({
      PORT: '4321',
      REDDIT_CLIENT_ID: 'id',
      REDDIT_CLIENT_SECRET: 'secret',
      REDDIT_USER_AGENT: 'web:reddit-mcp:v0.1.0 (by /u/test)',
      MCP_ALLOWED_HOSTS: 'reddit-mcp.example.com, localhost',
      MCP_ALLOWED_ORIGINS: 'https://chatgpt.com'
    });
    expect(config.port).toBe(4321);
    expect(config.allowedHosts).toEqual(['reddit-mcp.example.com', 'localhost']);
    expect(config.allowedOrigins).toEqual(['https://chatgpt.com']);
    expect(missingRedditConfig(config)).toEqual([]);
  });

  it('rejects invalid numeric config', () => {
    expect(() => loadConfig({ PORT: '99999' })).toThrow(/PORT/);
  });
});
