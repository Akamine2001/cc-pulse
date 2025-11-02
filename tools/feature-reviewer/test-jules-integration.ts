/**
 * Jules API 統合テスト
 *
 * セッション作成 → メッセージ送信の完全なフローをテスト
 */

import { JulesApiClient } from './core/jules-client';

async function testJulesIntegration() {
  const apiKey = process.env.JULES_API_KEY;

  if (!apiKey) {
    console.error('❌ JULES_API_KEY environment variable is not set');
    process.exit(1);
  }

  console.log('🧪 Jules API Integration Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // JulesApiClient初期化
  const owner = 'Akamine2001';
  const repo = 'cc-pulse';
  const julesClient = new JulesApiClient(apiKey, owner, repo);

  try {
    // ====== Step 1: セッション作成 ======
    console.log('📋 Step 1: Creating Jules session...');
    console.log('');

    const testPrompt = `# Test Session for API Integration

This is a test session created by cc-pulse automated testing.

## Task
Please analyze this test prompt and confirm receipt.

## Expected Behavior
- Session should be created successfully
- We should be able to send messages to this session
`;

    const issueNumber = 22;  // 実在するIssue
    const subIssueNumber = 23;  // 実在するサブIssue

    const response = await julesClient.startAutomatedImplementation(
      testPrompt,
      issueNumber,
      subIssueNumber
    );

    console.log('');
    console.log('✅ Session created!');
    console.log(`   URL: ${response.url}`);
    console.log('');

    // ====== Step 2: メッセージ送信 ======
    console.log('📋 Step 2: Sending message to session...');
    console.log('');

    const testMessage = `@jules This is a test message from cc-pulse.

Please confirm that you received this message and can process it.`;

    await julesClient.sendMessageToSession(response.url, testMessage);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Integration test completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ Session creation: SUCCESS');
    console.log('  ✅ Message sending: SUCCESS');
    console.log(`  📍 Session URL: ${response.url}`);
    console.log('');
    console.log('💡 Next steps:');
    console.log('  1. Check the session in Jules Web UI');
    console.log('  2. Verify that Jules received the message');
    console.log('  3. Implement PR comment monitoring workflow');

  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Integration test failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

testJulesIntegration();
