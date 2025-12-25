import { queryD1 } from './d1-client';

/**
 * Delete all test data (test+*@edgeshift.tech subscribers)
 */
export async function cleanupTestData(): Promise<{
  deletedSubscribers: number;
  deletedLogs: number;
  deletedSequences: number;
  deletedListMembers: number;
}> {
  console.log('Cleaning up test data...');

  // Delete delivery logs
  const logsResult = await queryD1(`
    DELETE FROM delivery_logs
    WHERE subscriber_id IN (
      SELECT id FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'
    )
  `);

  // Delete subscriber sequences
  const sequencesResult = await queryD1(`
    DELETE FROM subscriber_sequences
    WHERE subscriber_id IN (
      SELECT id FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'
    )
  `);

  // Delete contact list members
  const membersResult = await queryD1(`
    DELETE FROM contact_list_members
    WHERE subscriber_id IN (
      SELECT id FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'
    )
  `);

  // Count subscribers before deletion
  const countResult = await queryD1<{ count: number }>(`
    SELECT COUNT(*) as count FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'
  `);
  const subscriberCount = countResult[0]?.count || 0;

  // Delete subscribers
  await queryD1(`DELETE FROM subscribers WHERE email LIKE 'test+%@edgeshift.tech'`);

  console.log(`Deleted ${subscriberCount} test subscribers and related data`);

  return {
    deletedSubscribers: subscriberCount,
    deletedLogs: 0, // D1 doesn't return affected rows count
    deletedSequences: 0,
    deletedListMembers: 0,
  };
}

// Run cleanup if executed directly
// ES module check: import.meta.url contains the file path when run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  cleanupTestData()
    .then(result => {
      console.log('Cleanup complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
}
