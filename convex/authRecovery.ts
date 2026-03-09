import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { createAuth } from "./auth";

export const listAuthUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx as any);
    const authCtx = await auth.$context;
    const users = await authCtx.adapter.findMany({
      model: "user",
      sortBy: {
        field: "createdAt",
        direction: "desc"
      },
      limit: 20
    });

    return users.map((user: any) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: typeof user.createdAt === "number" ? user.createdAt : new Date(user.createdAt).getTime()
    }));
  }
});

export const resetPasswordForEmail = internalMutation({
  args: {
    email: v.string(),
    newPassword: v.string()
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    const auth = createAuth(ctx as any);
    const authCtx = await auth.$context;
    const userRecord = await authCtx.internalAdapter.findUserByEmail(normalizedEmail, {
      includeAccounts: true
    });

    if (!userRecord) {
      throw new ConvexError(`No auth user found for ${normalizedEmail}`);
    }

    const minPasswordLength = authCtx.password.config.minPasswordLength;
    if (args.newPassword.length < minPasswordLength) {
      throw new ConvexError(`Password must be at least ${minPasswordLength} characters`);
    }

    const maxPasswordLength = authCtx.password.config.maxPasswordLength;
    if (args.newPassword.length > maxPasswordLength) {
      throw new ConvexError(`Password must be at most ${maxPasswordLength} characters`);
    }

    const passwordHash = await authCtx.password.hash(args.newPassword);
    const credentialAccount = userRecord.accounts?.find((account) => account.providerId === "credential");

    if (!credentialAccount) {
      await authCtx.internalAdapter.createAccount({
        userId: userRecord.user.id,
        providerId: "credential",
        accountId: userRecord.user.id,
        password: passwordHash
      });
    } else {
      await authCtx.internalAdapter.updatePassword(userRecord.user.id, passwordHash);
    }

    if (authCtx.options.emailAndPassword?.revokeSessionsOnPasswordReset) {
      await authCtx.internalAdapter.deleteSessions(userRecord.user.id);
    }

    return {
      userId: userRecord.user.id,
      email: userRecord.user.email
    };
  }
});
