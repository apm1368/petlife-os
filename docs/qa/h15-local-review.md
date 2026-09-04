# H15 local integration

H15 is merged into integration/local at 5d6cc97. Public blog entry links and admin content creation/category/tag links are connected to existing routes. The new article form remains inspectable when optional metadata requests fail. Local preview continues to prohibit mutations.

The earlier H15 production build and 47 integration tests passed. Prisma client generation succeeded, but migration status could not connect to the local database. Migrations, article creation/publishing, authorization and live content loading are not verified. No seed/reset or fabricated records were applied.
