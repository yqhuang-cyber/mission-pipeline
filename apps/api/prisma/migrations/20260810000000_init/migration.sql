-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('draft', 'in_review', 'approved', 'published', 'archived');

-- CreateEnum
CREATE TYPE "NodeId" AS ENUM ('N0', 'N1', 'N2', 'N3', 'N4', 'N5');

-- CreateEnum
CREATE TYPE "NodeRunStatus" AS ENUM ('pending', 'running', 'awaiting_review', 'approved', 'failed', 'stale');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('choice', 'confirm', 'edit_required', 'warning_ack');

-- CreateEnum
CREATE TYPE "DecisionSeverity" AS ENUM ('blocking', 'deferrable', 'info');

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'draft',
    "currentNode" "NodeId" NOT NULL DEFAULT 'N0',
    "masterDataVersion" TEXT NOT NULL DEFAULT 'v0729',
    "ownerName" TEXT NOT NULL DEFAULT 'CD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeRun" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "node" "NodeId" NOT NULL,
    "status" "NodeRunStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "node" "NodeId" NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'text/markdown',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "nodeRunId" TEXT,
    "node" "NodeId" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "type" "DecisionType" NOT NULL,
    "severity" "DecisionSeverity" NOT NULL,
    "question" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL DEFAULT '[]',
    "aiRationale" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolutionJson" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NodeRun_missionId_node_idx" ON "NodeRun"("missionId", "node");

-- CreateIndex
CREATE UNIQUE INDEX "NodeRun_missionId_node_attempt_key" ON "NodeRun"("missionId", "node", "attempt");

-- CreateIndex
CREATE INDEX "Artifact_missionId_node_idx" ON "Artifact"("missionId", "node");

-- CreateIndex
CREATE INDEX "Decision_missionId_node_resolved_idx" ON "Decision"("missionId", "node", "resolved");

-- CreateIndex
CREATE INDEX "AuditEvent_missionId_createdAt_idx" ON "AuditEvent"("missionId", "createdAt");

-- AddForeignKey
ALTER TABLE "NodeRun" ADD CONSTRAINT "NodeRun_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_nodeRunId_fkey" FOREIGN KEY ("nodeRunId") REFERENCES "NodeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

