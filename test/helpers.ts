import { adminDb } from '@/lib/instant/instant-admin';

export const deleteAllUsers = async () => {
  const { $users: allUsers } = await adminDb.query({
    $users: {},
  });
  console.log('got ', allUsers.length, 'users');
  const batchSize = 100;
  for (let i = 0; i < allUsers.length; i += batchSize) {
    // Get the current batch
    const batch = allUsers.slice(i, i + batchSize);

    // Create a transaction for each user in the batch
    const batchTransactions = batch.map(user => adminDb.tx.$users[user.id].delete());

    // Execute the batch of transactions
    await adminDb.transact(batchTransactions);

    console.log(
      `Processed batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(allUsers.length / batchSize)}: ${batch.length} users`
    );
  }
};
