# Turning on real access control

Until now, Gridiron Hub's Firestore project (`my-gridiron-hub`) has never had a
`firestore.rules` file — nothing has ever deployed real security rules to it.
That means it's been running on whatever the Firebase console defaulted to
the day the project was created: either locked to deny-everything (logins
silently fail to save a user profile) or wide open to any signed-in visitor
for 30 days before locking down. Worth checking which one you're on, and
either way, worth fixing now that there's a real rules file to deploy.

This also turns on the first real piece of "role-based visibility": every
person who signs in gets a `users/{uid}` profile, and an **Admin** page lets
you assign each of them a role (Parent / Coach / Board / Admin) and which
teams they belong to. Nobody can grant themselves a role — that's enforced
server-side by `firestore.rules`, not just hidden by the UI.

About 5 minutes, all on the free tier.

---

## 1. Deploy the rules

From this folder (`gridiron-hub/`):

```bash
npm install -g firebase-tools   # skip if you already have it
firebase login
firebase deploy --only firestore:rules
```

`.firebaserc` already points at `my-gridiron-hub`, so there's no project
picker step. If the CLI asks anyway, choose `my-gridiron-hub`.

> If this is the very first deploy of rules to this project and Firestore
> itself hasn't been created yet, go to **console.firebase.google.com →
> my-gridiron-hub → Firestore Database → Create database** first, then
> re-run the deploy.

## 2. Make yourself the first admin

Nobody is an admin yet — the rules deliberately don't allow anyone to grant
themselves that. There's one manual step, done once, ever:

1. Open the live site and sign in with the Google account (or email) you
   want to administer with. This creates your `users/{uid}` profile.
2. Go to **console.firebase.google.com → my-gridiron-hub → Firestore
   Database → `users` collection**.
3. Find your document — it's filed under your uid, but the `email` field
   inside it is yours, so sort/scroll to find it that way.
4. Edit the `role` field and set it to the string `admin` (no quotes needed
   in the console's editor, just the text `admin`).
5. Reload the site. You'll see an **Admin** link next to your email in the
   nav — that's `role == 'admin'` taking effect.

## 3. Assign everyone else from the web, not the console

From here on, go to **Admin** in the nav. Everyone who has ever signed in
shows up there, split into **Pending** (no role yet) and **Everyone else**.
Pick a role from the dropdown, tap the teams they belong to, hit **Save**.
That's it — no more console edits needed for anyone but the very first
admin.

## Things worth knowing

**What a role actually unlocks.** Right now, a role mainly exists so that
future features (RSVPs, the team message board, coach-only tools) have
something real to check — Firestore itself refuses writes from anyone who
isn't an admin to another person's `role`/`orgId`/`teamIds`, and refuses a
non-admin from ever setting those fields on themselves, even by editing the
request directly. The admin page is a convenience on top of that
enforcement, not the enforcement itself.

**One organization.** The data model leaves room for Gridiron Hub to run
more than one organization later, but this deployment only has the ASL
Bengals, so the admin page sets `orgId` to `"asl-bengals"` automatically
the moment you give someone a role — nothing to pick.

**Removing someone's access.** Set their role back to Unassigned on the
Admin page. Their profile stays (so they don't lose their account if they
come back), it just stops carrying any role or team.

**Cost.** One document per person, read a handful of times per session.
Nowhere near the free Spark plan's limits for a youth sports org.
