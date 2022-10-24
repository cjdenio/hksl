-- CreateTable
CREATE TABLE "User" (
    "slackId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("slackId")
);
