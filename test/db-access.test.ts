import { id, lookup } from '@instantdb/admin';
import { describe, test } from 'vitest';
import schema from './instant.schema';
import './vitest-matchers';
import { createUsers, adminDb } from './create-users';



test('DB and test user setup works', async ({ expect }) => {
  const user1 = { id: id(), email: 'setup1_test@lanterntest' };
  const user2 = { id: id(), email: 'setup2_test@lanterntest' };

  expect(adminDb).not.toBe(null);

  const getTestUsersByEmail = async (emails: string[]) => {
    const { $users: testusers } = await adminDb.query({
      $users: {
        $: {
          where: {
            or: emails.map(email => {
              return { email };
            }),
          },
        },
      },
    });
    return testusers;
  };

  await adminDb.transact([
    adminDb.tx.$users[lookup('email', user1.email)].delete(),
    adminDb.tx.$users[lookup('email', user2.email)].delete(),
  ]);

  expect(await getTestUsersByEmail([user1.email, user2.email])).toStrictEqual([]);

  await adminDb.transact([
    adminDb.tx.$users[user1.id].update({ email: user1.email }),
    adminDb.tx.$users[user2.id].update({ email: user2.email }),
  ]);

  const testusers = await getTestUsersByEmail([user1.email, user2.email]);
  testusers.sort((u1, u2) => u1.email.localeCompare(u2.email));
  expect(testusers).toStrictEqual([user1, user2]);
});

/*********************************** basic tests ***********************************/

describe.concurrent('InstantDB basic access, relationship and permission Checks', async () => {
  test.todo('guests do not have access to anything', async ({ expect }) => {
    const dbGuest = adminDb.asUser({ guest: false });
    const allEntities = Object.keys(schema.entities);

    const queryAll: Record<string, object> = {};
    allEntities.forEach(e => {
      queryAll[e] = {};
    });
    const all = await dbGuest.query(queryAll);

    // Ensure all returned objects are empty arrays
    allEntities.forEach(entity => {
      expect(all[entity]).toStrictEqual([]);
    });
  });

  test('profile must have a name and be associated with $user', async ({ expect }) => {
    const users = await createUsers('profile_test');
    const [user1, user2] = users;
    const db1 = user1.db;

    const profileTxNoNameNoUser = db1.tx.profiles[id()].update({});
    const profileTxNoName = db1.tx.profiles[id()].update({}).link({ user: user1.id });
    const profileTxNoUser = db1.tx.profiles[id()].update({ name: 'Joe' });
    const profileTxWrongUser = db1.tx.profiles[id()]
      .update({ name: 'Joe' })
      .link({ user: user2.id });
    const profileId = id();
    const profileTx = db1.tx.profiles[profileId].update({ name: 'Joe' }).link({ user: user1.id });
    const profileDupTx = db1.tx.profiles[id()].update({ name: 'Joe' }).link({ user: user1.id });

    await Promise.all([
      expect(db1.transact(profileTxNoNameNoUser)).rejects.toBePermissionDenied(),
      expect(db1.transact(profileTxNoName)).rejects.toBePermissionDenied(),
      expect(db1.transact(profileTxNoUser)).rejects.toBePermissionDenied(),
      expect(db1.transact(profileTxWrongUser)).rejects.toBePermissionDenied(),
    ]);

    // Note: this CANNOT be part of parallel Promise.all above, since that makes the test flaky, when this succeeding transaction commits
    // before the expected failures above, resulting in profile.user record-not-unique in place of expected permission-denied
    await db1.transact(profileTx);

    // updates
    await Promise.all([
      expect(
        // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
        db1.transact(db1.tx.profiles[profileId].update({ name: null }))
      ).rejects.toBePermissionDenied(),
      expect(
        // @ts-expect-error - Testing invalid attribute
        db1.transact(db1.tx.profiles[profileId].update({ nonexistent_attribute: null }))
      ).rejects.toBeValidationFailed(),
      expect(
        db1.transact(db1.tx.profiles[profileId].unlink({ user: user1.id }))
      ).rejects.toBePermissionDenied(),
      // cannot replace profile.user with a non-existent $user.id
      expect(
        db1.transact(db1.tx.profiles[profileId].link({ user: id() }))
      ).rejects.toBePermissionDenied(),
      // cannot replace profile link to point to a different user
      expect(
        db1.transact(db1.tx.profiles[profileId].link({ user: user2.id }))
      ).rejects.toBePermissionDenied(),

      expect(db1.transact(profileDupTx)).rejects.toBeUniquenessFailure(),

      // only admin can do deletes
      expect(db1.transact(db1.tx.profiles[profileId].delete())).rejects.toBePermissionDenied(),
    ]);

    await Promise.all(users.map(u => u.delete()));
    //TODO: ensure no dangling things
  });

  test('member must have role, createdAt and be associated with profile and team', async ({
    expect,
  }) => {
    // Create test users with profiles
    const users = await createUsers('member_test', { profile: true });
    const [user1, user2] = users;
    const db1 = user1.db;

    const teamId = id();
    const memberId = id();

    // team transaction that will run along with the member creation, to make sure all interdependent constraints
    // are satisfied
    const teamTx = db1.tx.teams[teamId]
      .update({
        name: 'Test Team',
        slug: `test-team-${Date.now()}`,
        createdAt: Date.now(),
      })
      .link({ members: memberId });

    // Test invalid member creation scenarios
    const memberTxNoRoleNoLinks = db1.tx.members[memberId].update({});
    const memberTxNoCreatedAt = db1.tx.members[memberId]
      .update({ role: 'member' })
      .link({ profile: user1.profileId, team: teamId });
    const memberTxNoProfile = db1.tx.members[memberId]
      .update({
        role: 'member',
        createdAt: Date.now(),
      })
      .link({ team: teamId });
    const memberTxNoTeam = db1.tx.members[memberId]
      .update({
        role: 'member',
        createdAt: Date.now(),
      })
      .link({ profile: user1.profileId });

    // Test with wrong user's profile (should fail)
    const memberTxWrongProfile = db1.tx.members[memberId]
      .update({
        role: 'member',
        createdAt: Date.now(),
      })
      .link({ profile: user2.profileId, team: teamId });

    // Valid member creation
    const memberTx = db1.tx.members[memberId]
      .update({
        role: 'member',
        createdAt: Date.now(),
      })
      .link({ profile: user1.profileId, team: teamId });

    // Duplicate member creation (should fail with uniqueness error)
    //TODO: bring back when allowing any updates
    // const memberDupTx = db1.tx.members[memberId]
    //   .update({
    //     role: 'member',
    //     createdAt: Date.now(),
    //   })
    //   .link({ profile: user1.profileId, team: teamId });

    await Promise.all([
      expect(db1.transact([teamTx, memberTxNoRoleNoLinks])).rejects.toBePermissionDenied(),
      expect(db1.transact([teamTx, memberTxNoCreatedAt])).rejects.toBePermissionDenied(),
      expect(db1.transact([teamTx, memberTxNoProfile])).rejects.toBePermissionDenied(),
      expect(
        db1.transact([teamTx.unlink({ members: memberId }), memberTxNoTeam])
      ).rejects.toBePermissionDenied(),
      expect(db1.transact([teamTx, memberTxWrongProfile])).rejects.toBePermissionDenied(),
    ]);

    // This should succeed
    await db1.transact([teamTx, memberTx]);

    // Now test update scenarios
    await Promise.all([
      // Cannot update with null role
      expect(
        // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
        db1.transact(db1.tx.members[memberId].update({ role: null }))
      ).rejects.toBePermissionDenied(),

      // Cannot add non-existent attribute
      expect(
        // @ts-expect-error - Testing invalid attribute
        db1.transact(db1.tx.members[memberId].update({ nonexistent_attribute: 'value' }))
      ).rejects.toBeValidationFailed(),

      // Cannot unlink profile
      expect(
        db1.transact(db1.tx.members[memberId].unlink({ profile: user1.profileId }))
      ).rejects.toBePermissionDenied(),

      // Cannot unlink team
      expect(
        db1.transact(db1.tx.members[memberId].unlink({ team: teamId }))
      ).rejects.toBePermissionDenied(),

      // Cannot change profile link
      expect(
        db1.transact(db1.tx.members[memberId].link({ profile: user2.profileId }))
      ).rejects.toBePermissionDenied(),

      // Cannot create duplicate member
      //TODO: bring back when allowing any updates
      // expect.skip(db1.transact(memberDupTx)).rejects.toBeUniquenessFailure(),

      // Regular user cannot delete member (only admin can)
      expect(db1.transact(db1.tx.members[memberId].delete())).rejects.toBePermissionDenied(),
    ]);

    await Promise.all(users.map(u => u.delete()));
  });

  test('invitation must have email, role, status, createdAt and be associated with inviter and team', async ({
    expect,
  }) => {
    // Create test users with profiles and teams
    const users = await createUsers('invitation_test', { profile: true, team: true });
    const [user1, user2] = users;
    const db1 = user1.db;

    // Test invalid invitation creation scenarios
    const invitationId = id();
    const invitationTxNoAttrs = db1.tx.invitations[invitationId].update({});
    const invitationTxNoEmail = db1.tx.invitations[invitationId]
      .update({
        role: 'member',
        status: 'pending',
        createdAt: Date.now(),
      })
      .link({ inviter: user1.profileId, team: user1.teamId });
    const invitationTxNoRole = db1.tx.invitations[invitationId]
      .update({
        email: 'test@example.com',
        status: 'pending',
        createdAt: Date.now(),
      })
      .link({ inviter: user1.profileId, team: user1.teamId });
    const invitationTxNoStatus = db1.tx.invitations[invitationId]
      .update({
        email: 'test@example.com',
        role: 'member',
        createdAt: Date.now(),
      })
      .link({ inviter: user1.profileId, team: user1.teamId });
    const invitationTxNoCreatedAt = db1.tx.invitations[invitationId]
      .update({
        email: 'test@example.com',
        role: 'member',
        status: 'pending',
      })
      .link({ inviter: user1.profileId, team: user1.teamId });
    const invitationTxNoInviter = db1.tx.invitations[invitationId]
      .update({
        email: 'test@example.com',
        role: 'member',
        status: 'pending',
        createdAt: Date.now(),
      })
      .link({ team: user1.teamId });
    const invitationTxNoTeam = db1.tx.invitations[invitationId]
      .update({
        email: 'test@example.com',
        role: 'member',
        status: 'pending',
        createdAt: Date.now(),
      })
      .link({ inviter: user1.profileId });
    const invitationTxWrongTeam = db1.tx.invitations[invitationId]
      .update({
        email: 'test@example.com',
        role: 'member',
        status: 'pending',
        createdAt: Date.now(),
      })
      .link({ inviter: user1.profileId, team: user2.teamId });

    // Valid invitation creation
    const validInvitationTx = db1.tx.invitations[invitationId]
      .update({
        email: 'test@example.com',
        role: 'member',
        status: 'pending',
        createdAt: Date.now(),
      })
      .link({ inviter: user1.profileId, team: user1.teamId });

    // Test all invalid creation scenarios in parallel
    await Promise.all([
      expect(db1.transact(invitationTxNoAttrs)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationTxNoEmail)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationTxNoRole)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationTxNoStatus)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationTxNoCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationTxNoInviter)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationTxNoTeam)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationTxWrongTeam)).rejects.toBePermissionDenied(),
    ]);

    // Create a valid invitation
    await db1.transact(validInvitationTx);

    // Invalid update scenarios
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const invitationUpdateTxNullEmail = db1.tx.invitations[invitationId].update({ email: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const invitationUpdateTxNullRole = db1.tx.invitations[invitationId].update({ role: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const invitationUpdateTxNullStatus = db1.tx.invitations[invitationId].update({ status: null });
    const invitationUpdateTxNullCreatedAt = db1.tx.invitations[invitationId].update({
      // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
      createdAt: null,
    });
    const invitationUnlinkInviter = db1.tx.invitations[invitationId].unlink({
      inviter: user1.profileId,
    });
    const invitationUnlinkTeam = db1.tx.invitations[invitationId].unlink({ team: user1.teamId });
    const invitationChangeInviter = db1.tx.invitations[invitationId].link({
      inviter: user2.profileId,
    });
    const invitationChangeTeam = db1.tx.invitations[invitationId].link({ team: user2.teamId });
    const invitationInvalidAttr = db1.tx.invitations[invitationId].update({
      // @ts-expect-error - Testing invalid attribute
      nonexistent_attribute: 'value',
    });

    // Invalid delete scenarios
    // Another user cannot delete my invitation
    const invitationDeleteByU2 = user2.db.tx.invitations[invitationId].delete();

    // Test all update scenarios in parallel
    await Promise.all([
      expect(db1.transact(invitationUpdateTxNullEmail)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationUpdateTxNullRole)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationUpdateTxNullStatus)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationUpdateTxNullCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationUnlinkInviter)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationUnlinkTeam)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationChangeInviter)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationChangeTeam)).rejects.toBePermissionDenied(),
      expect(db1.transact(invitationInvalidAttr)).rejects.toBeValidationFailed(),

      expect(user2.db.transact(invitationDeleteByU2)).rejects.toBePermissionDenied(),
    ]);

    // User can delete their own invitation
    await db1.transact(db1.tx.invitations[invitationId].delete());

    // TODO: Admin can delete any invitation in their team (if permissions allow)

    // Clean up
    await Promise.all(users.map(u => u.delete()));
  });

  test('project must have name, slug, createdAt and be associated with a team', async ({
    expect,
  }) => {
    // Create test users with profiles and teams
    const users = await createUsers('project_test', { profile: true, team: true });
    const [user1, user2] = users;
    const db1 = user1.db;

    const projectId = id();
    const projectId2 = id();

    // Test invalid project creation scenarios
    const projectTxNoAttrs = db1.tx.projects[projectId].update({});
    const projectTxNoName = db1.tx.projects[projectId]
      .update({
        slug: `test-project-${Date.now()}`,
        createdAt: Date.now(),
      })
      .link({ team: user1.teamId });
    const projectTxNoSlug = db1.tx.projects[projectId]
      .update({
        name: 'Test Project',
        createdAt: Date.now(),
      })
      .link({ team: user1.teamId });
    const projectTxNoCreatedAt = db1.tx.projects[projectId]
      .update({
        name: 'Test Project',
        slug: `test-project-${Date.now()}`,
      })
      .link({ team: user1.teamId });
    const projectTxNoTeam = db1.tx.projects[projectId].update({
      name: 'Test Project',
      slug: `test-project-${Date.now()}`,
      createdAt: Date.now(),
    });
    const projectFakeTeam = db1.tx.projects[projectId]
      .update({
        name: 'Test Project',
        slug: `test-project-${Date.now()}`,
        createdAt: Date.now(),
      })
      .link({ team: id() });
    const projectTxWrongTeam = db1.tx.projects[projectId]
      .update({
        name: 'Test Project',
        slug: `test-project-${Date.now()}`,
        createdAt: Date.now(),
      })
      .link({ team: user2.teamId });

    // Valid project creation
    const slug1 = `test-project-${Date.now()}`;
    const validProjectTx = db1.tx.projects[projectId]
      .update({
        name: 'Test Project',
        slug: slug1,
        createdAt: Date.now(),
      })
      .link({ team: user1.teamId });

    // create second valid project to test slug collisions
    const validProjectTx2 = db1.tx.projects[projectId2]
      .update({
        name: 'Test Project',
        slug: slug1 + '-2',
        createdAt: Date.now(),
      })
      .link({ team: user1.teamId });

    // Test all invalid creation scenarios in parallel
    await Promise.all([
      expect(db1.transact(projectTxNoAttrs)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectTxNoName)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectTxNoSlug)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectTxNoCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectTxNoTeam)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectFakeTeam)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectTxWrongTeam)).rejects.toBePermissionDenied(),
    ]);

    // Create valid projects
    await db1.transact([validProjectTx, validProjectTx2]);

    // Test update scenarios
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const projectUpdateTxNullName = db1.tx.projects[projectId].update({ name: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const projectUpdateTxNullSlug = db1.tx.projects[projectId].update({ slug: null });
    const projectUpdateTxSameSlug = db1.tx.projects[projectId2].update({ slug: slug1 });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const projectUpdateTxNullCreatedAt = db1.tx.projects[projectId].update({ createdAt: null });
    const projectUnlinkTeam = db1.tx.projects[projectId].unlink({ team: user1.teamId });
    const projectChangeTeam = db1.tx.projects[projectId].link({ team: user2.teamId });
    const projectChangeToFakeTeam = db1.tx.projects[projectId].link({ team: id() });

    const projectInvalidAttr = db1.tx.projects[projectId].update({
      // @ts-expect-error - Testing invalid attribute
      nonexistent_attribute: 'value',
    });

    // Test all update scenarios in parallel
    await Promise.all([
      expect(db1.transact(projectUpdateTxNullName)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectUpdateTxNullSlug)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectUpdateTxSameSlug)).rejects.toBeUniquenessFailure(),
      expect(db1.transact(projectUpdateTxNullCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectUnlinkTeam)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectChangeToFakeTeam)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectChangeTeam)).rejects.toBePermissionDenied(),
      expect(db1.transact(projectInvalidAttr)).rejects.toBeValidationFailed(),

      // deletes
      expect(db1.transact(db1.tx.projects[projectId].delete())).rejects.toBePermissionDenied(),
      expect(
        user2.db.transact(user2.db.tx.projects[projectId].delete())
      ).rejects.toBePermissionDenied(),
    ]);

    // Clean up
    await Promise.all(users.map(u => u.delete()));
  });

  test('blog must have title, slug, json, html, createdAt, updatedAt and be associated with a project', async ({
    expect,
  }) => {
    // Create test users with profiles, teams, and projects
    const users = await createUsers('blog_test', { profile: true, team: true, project: true });
    const [user1, user2] = users;
    const db1 = user1.db;

    const blogId = id();

    // Test invalid blog creation scenarios
    const blogTxNoAttrs = db1.tx.blogs[blogId].update({});
    const blogTxNoTitle = db1.tx.blogs[blogId]
      .update({
        slug: `test-blog-${Date.now()}`,
        json: {},
        html: '<p>Test</p>',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const blogTxNoSlug = db1.tx.blogs[blogId]
      .update({
        title: 'Test Blog',
        json: {},
        html: '<p>Test</p>',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const blogTxNoJson = db1.tx.blogs[blogId]
      .update({
        title: 'Test Blog',
        slug: `test-blog-${Date.now()}`,
        html: '<p>Test</p>',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const blogTxNoHtml = db1.tx.blogs[blogId]
      .update({
        title: 'Test Blog',
        slug: `test-blog-${Date.now()}`,
        json: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const blogTxNoCreatedAt = db1.tx.blogs[blogId]
      .update({
        title: 'Test Blog',
        slug: `test-blog-${Date.now()}`,
        json: {},
        html: '<p>Test</p>',
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const blogTxNoUpdatedAt = db1.tx.blogs[blogId]
      .update({
        title: 'Test Blog',
        slug: `test-blog-${Date.now()}`,
        json: {},
        html: '<p>Test</p>',
        createdAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const blogTxNoProject = db1.tx.blogs[blogId].update({
      title: 'Test Blog',
      slug: `test-blog-${Date.now()}`,
      json: {},
      html: '<p>Test</p>',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const blogTxFakeProject = db1.tx.blogs[blogId]
      .update({
        title: 'Test Blog',
        slug: `test-blog-${Date.now()}`,
        json: {},
        html: '<p>Test</p>',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: id() });
    const blogTxWrongProject = db1.tx.blogs[blogId]
      .update({
        title: 'Test Blog',
        slug: `test-blog-${Date.now()}`,
        json: {},
        html: '<p>Test</p>',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user2.projectId });

    // Valid blog creation
    const validBlogTx = db1.tx.blogs[blogId]
      .update({
        title: 'Test Blog',
        slug: `test-blog-${Date.now()}`,
        json: {},
        html: '<p>Test</p>',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });

    // Test all invalid creation scenarios in parallel
    await Promise.all([
      expect(db1.transact(blogTxNoAttrs)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxNoTitle)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxNoSlug)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxNoJson)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxNoHtml)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxNoCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxNoUpdatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxNoProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxFakeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogTxWrongProject)).rejects.toBePermissionDenied(),
    ]);

    // Create a valid blog
    await db1.transact(validBlogTx);

    // Test update scenarios
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const blogUpdateTxNullTitle = db1.tx.blogs[blogId].update({ title: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const blogUpdateTxNullSlug = db1.tx.blogs[blogId].update({ slug: null });
    const blogUpdateTxNullJson = db1.tx.blogs[blogId].update({ json: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const blogUpdateTxNullHtml = db1.tx.blogs[blogId].update({ html: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const blogUpdateTxNullCreatedAt = db1.tx.blogs[blogId].update({ createdAt: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const blogUpdateTxNullUpdatedAt = db1.tx.blogs[blogId].update({ updatedAt: null });
    const blogUnlinkProject = db1.tx.blogs[blogId].unlink({ project: user1.projectId });
    const blogChangeProject = db1.tx.blogs[blogId].link({ project: user2.projectId });
    const blogChangeToFakeProject = db1.tx.blogs[blogId].link({ project: id() });

    // @ts-expect-error - Testing invalid attribute
    const blogInvalidAttr = db1.tx.blogs[blogId].update({ nonexistent_attribute: 'value' });

    // Test all update scenarios in parallel
    await Promise.all([
      expect(db1.transact(blogUpdateTxNullTitle)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogUpdateTxNullSlug)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogUpdateTxNullJson)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogUpdateTxNullHtml)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogUpdateTxNullCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogUpdateTxNullUpdatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogUnlinkProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogChangeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogChangeToFakeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(blogInvalidAttr)).rejects.toBeValidationFailed(),

      // deletes
      expect(db1.transact(db1.tx.blogs[blogId].delete())).rejects.toBePermissionDenied(),
      expect(user2.db.transact(user2.db.tx.blogs[blogId].delete())).rejects.toBePermissionDenied(),
    ]);

    // Clean up
    await Promise.all(users.map(u => u.delete()));
  });

  test('domain must have url, createdAt and be associated with a project', async ({ expect }) => {
    // Create test users with profiles, teams, and projects
    const users = await createUsers('domain_test', { profile: true, team: true, project: true });
    const [user1, user2] = users;
    const db1 = user1.db;

    const domainId = id();

    // Test invalid domain creation scenarios
    const domainTxNoAttrs = db1.tx.domains[domainId].update({});
    const domainTxNoUrl = db1.tx.domains[domainId]
      .update({
        createdAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const domainTxNoCreatedAt = db1.tx.domains[domainId]
      .update({
        url: 'test.example.com',
      })
      .link({ project: user1.projectId });
    const domainTxNoProject = db1.tx.domains[domainId].update({
      url: 'test.example.com',
      createdAt: Date.now(),
    });

    const domainTxFakeProject = db1.tx.domains[domainId]
      .update({
        url: 'test.example.com',
        createdAt: Date.now(),
      })
      .link({ project: id() });
    const domainTxWrongProject = db1.tx.domains[domainId]
      .update({
        url: 'test.example.com',
        createdAt: Date.now(),
      })
      .link({ project: user2.projectId });

    // Valid domain creation
    const validDomainTx = db1.tx.domains[domainId]
      .update({
        url: 'test.example.com',
        createdAt: Date.now(),
      })
      .link({ project: user1.projectId });

    // Test all invalid creation scenarios in parallel
    await Promise.all([
      expect(db1.transact(domainTxNoAttrs)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainTxNoUrl)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainTxNoCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainTxNoProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainTxFakeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainTxWrongProject)).rejects.toBePermissionDenied(),
    ]);

    // Create a valid domain
    await db1.transact(validDomainTx);

    // Test update scenarios
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const domainUpdateTxNullUrl = db1.tx.domains[domainId].update({ url: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const domainUpdateTxNullCreatedAt = db1.tx.domains[domainId].update({ createdAt: null });
    const domainUnlinkProject = db1.tx.domains[domainId].unlink({ project: user1.projectId });
    const domainChangeProject = db1.tx.domains[domainId].link({ project: user2.projectId });
    const domainChangeToFakeProject = db1.tx.domains[domainId].link({ project: id() });

    // @ts-expect-error - Testing invalid attribute
    const domainInvalidAttr = db1.tx.domains[domainId].update({ nonexistent_attribute: 'value' });

    // Test all update scenarios in parallel
    await Promise.all([
      expect(db1.transact(domainUpdateTxNullUrl)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainUpdateTxNullCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainUnlinkProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainChangeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainChangeToFakeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(domainInvalidAttr)).rejects.toBeValidationFailed(),

      // deletes
      expect(db1.transact(db1.tx.domains[domainId].delete())).rejects.toBePermissionDenied(),
      expect(
        user2.db.transact(user2.db.tx.domains[domainId].delete())
      ).rejects.toBePermissionDenied(),
    ]);

    // Clean up
    await Promise.all(users.map(u => u.delete()));
  });

  test('page must have path, createdAt, updatedAt and be associated with a project', async ({
    expect,
  }) => {
    // Create test users with profiles, teams, and projects
    const users = await createUsers('page_test', { profile: true, team: true, project: true });
    const [user1, user2] = users;
    const db1 = user1.db;

    const pageId = id();

    // Test invalid page creation scenarios
    const pageTxNoAttrs = db1.tx.pages[pageId].update({});
    const pageTxNoPath = db1.tx.pages[pageId]
      .update({
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const pageTxNoCreatedAt = db1.tx.pages[pageId]
      .update({
        path: '/test',
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const pageTxNoUpdatedAt = db1.tx.pages[pageId]
      .update({
        path: '/test',
        createdAt: Date.now(),
      })
      .link({ project: user1.projectId });
    const pageTxNoProject = db1.tx.pages[pageId].update({
      path: '/test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const pageTxFakeProject = db1.tx.pages[pageId]
      .update({
        path: '/test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: id() });
    const pageTxWrongProject = db1.tx.pages[pageId]
      .update({
        path: '/test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user2.projectId });

    // Valid page creation
    const validPageTx = db1.tx.pages[pageId]
      .update({
        path: '/test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .link({ project: user1.projectId });

    // Test all invalid creation scenarios in parallel
    await Promise.all([
      expect(db1.transact(pageTxNoAttrs)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageTxNoPath)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageTxNoCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageTxNoUpdatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageTxNoProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageTxFakeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageTxWrongProject)).rejects.toBePermissionDenied(),
    ]);

    // Create a valid page
    await db1.transact(validPageTx);

    // Test update scenarios
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const pageUpdateTxNullPath = db1.tx.pages[pageId].update({ path: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const pageUpdateTxNullCreatedAt = db1.tx.pages[pageId].update({ createdAt: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const pageUpdateTxNullUpdatedAt = db1.tx.pages[pageId].update({ updatedAt: null });
    const pageUnlinkProject = db1.tx.pages[pageId].unlink({ project: user1.projectId });
    const pageChangeProject = db1.tx.pages[pageId].link({ project: user2.projectId });
    const pageChangeToFakeProject = db1.tx.pages[pageId].link({ project: id() });

    // @ts-expect-error - Testing invalid attribute
    const pageInvalidAttr = db1.tx.pages[pageId].update({ nonexistent_attribute: 'value' });

    // Test all update scenarios in parallel
    await Promise.all([
      expect(db1.transact(pageUpdateTxNullPath)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageUpdateTxNullCreatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageUpdateTxNullUpdatedAt)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageUnlinkProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageChangeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageChangeToFakeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(pageInvalidAttr)).rejects.toBeValidationFailed(),

      // deletes
      expect(db1.transact(db1.tx.pages[pageId].delete())).rejects.toBePermissionDenied(),
      expect(user2.db.transact(user2.db.tx.pages[pageId].delete())).rejects.toBePermissionDenied(),
    ]);

    // Clean up
    await Promise.all(users.map(u => u.delete()));
  });

  test('cost must have internalCost, startOfMonth and be associated with a project', async ({
    expect,
  }) => {
    // Create test users with profiles, teams, and projects
    const users = await createUsers('cost_test', { profile: true, team: true, project: true });
    const [user1, user2] = users;
    const db1 = user1.db;

    const costId = id();

    // Test invalid cost creation scenarios
    const costTxNoAttrs = db1.tx.costs[costId].update({});
    const costTxNoInternalCost = db1.tx.costs[costId]
      .update({
        startOfMonth: Date.now(),
      })
      .link({ project: user1.projectId });
    const costTxNoStartOfMonth = db1.tx.costs[costId]
      .update({
        internalCost: 100,
      })
      .link({ project: user1.projectId });
    const costTxNoProject = db1.tx.costs[costId].update({
      internalCost: 100,
      startOfMonth: Date.now(),
    });
    const costTxFakeProject = db1.tx.costs[costId]
      .update({
        internalCost: 100,
        startOfMonth: Date.now(),
      })
      .link({ project: id() });
    const costTxWrongProject = db1.tx.costs[costId]
      .update({
        internalCost: 100,
        startOfMonth: Date.now(),
      })
      .link({ project: user2.projectId });

    // Valid cost creation
    const validCostTx = db1.tx.costs[costId]
      .update({
        internalCost: 100,
        startOfMonth: Date.now(),
      })
      .link({ project: user1.projectId });

    // Test all invalid creation scenarios in parallel
    await Promise.all([
      expect(db1.transact(costTxNoAttrs)).rejects.toBePermissionDenied(),
      expect(db1.transact(costTxNoInternalCost)).rejects.toBePermissionDenied(),
      expect(db1.transact(costTxNoStartOfMonth)).rejects.toBePermissionDenied(),
      expect(db1.transact(costTxNoProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(costTxFakeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(costTxWrongProject)).rejects.toBePermissionDenied(),
    ]);

    // Create a valid cost
    await db1.transact(validCostTx);

    // Test update scenarios
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const costUpdateTxNullInternalCost = db1.tx.costs[costId].update({ internalCost: null });
    // @ts-expect-error Bypassing ts type system to make sure DB properly denies null values
    const costUpdateTxNullStartOfMonth = db1.tx.costs[costId].update({ startOfMonth: null });
    const costUnlinkProject = db1.tx.costs[costId].unlink({ project: user1.projectId });
    const costChangeProject = db1.tx.costs[costId].link({ project: user2.projectId });
    const costChangeToFakeProject = db1.tx.costs[costId].link({ project: id() });

    // @ts-expect-error - Testing invalid attribute
    const costInvalidAttr = db1.tx.costs[costId].update({ nonexistent_attribute: 'value' });

    // Test all update scenarios in parallel
    await Promise.all([
      expect(db1.transact(costUpdateTxNullInternalCost)).rejects.toBePermissionDenied(),
      expect(db1.transact(costUpdateTxNullStartOfMonth)).rejects.toBePermissionDenied(),
      expect(db1.transact(costUnlinkProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(costChangeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(costChangeToFakeProject)).rejects.toBePermissionDenied(),
      expect(db1.transact(costInvalidAttr)).rejects.toBeValidationFailed(),

      // deletes
      expect(db1.transact(db1.tx.costs[costId].delete())).rejects.toBePermissionDenied(),
      expect(user2.db.transact(user2.db.tx.costs[costId].delete())).rejects.toBePermissionDenied(),
    ]);

    // Clean up
    await Promise.all(users.map(u => u.delete()));
  });
});

/*********************************** cascading delete tests ***********************************/

// not needed

/*********************************** per-user entity LIMIT tests ***********************************/

// not needed
