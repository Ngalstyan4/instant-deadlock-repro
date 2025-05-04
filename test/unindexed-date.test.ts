import { test, expect } from 'vitest';
// import schema from './instant.schema';
import './vitest-matchers';
import { createUsers, adminDb } from './create-users';

test("unindexed dates are not exact-filterable", async () => {

  const [user] = await createUsers('costs_unindexed_test', { profile: true, team: true, project: true, cost: true, numUsers: 1 })

  const db = adminDb.asUser({ email: user.email })

  const { costs } = await db.query({ costs: {} })
  //TODO: expect costs to be an array with one element
  expect(costs).toHaveLength(1)
  expect(costs[0].startOfMonthUnindexed).toBeUndefined()
  expect(costs[0].startOfMonth).not.toBeUndefined()

  // create users does not set startOfMonthUnindexed field. let's set it here
  const t = costs[0].startOfMonth
  // the options below also cause the same issue:
  // const t = new Date().getTime()
  // const t = Date.now()
  adminDb.transact(db.tx.costs[costs[0].id].update({ startOfMonthUnindexed: t, startOfMonth: t }))
  const { costs: updatedCosts } = await db.query({ costs: {} })
  expect(updatedCosts[0].startOfMonthUnindexed).not.toBeUndefined()
  expect(updatedCosts[0].startOfMonth).not.toBeUndefined()


  const specificCostIndexed = await db.query({ costs: { $: { where: { startOfMonth: t } } } })
  const specificCostUnindexed = await db.query({ costs: { $: { where: { startOfMonthUnindexed: t } } } })
  expect(specificCostIndexed.costs).toHaveLength(1)


  console.log("specific indexed", specificCostIndexed)
  console.log("specific unindexed", specificCostUnindexed)

  // TEST FAILS because this is zero
  expect(specificCostUnindexed.costs).toHaveLength(1)


  user.delete()

})
