-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" SERIAL NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "punchTime" TIMESTAMP(3) NOT NULL,
    "punchType" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" SERIAL NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_deviceUserId_key" ON "Employee"("deviceUserId");

-- CreateIndex
CREATE INDEX "AttendanceLog_punchTime_idx" ON "AttendanceLog"("punchTime");

-- CreateIndex
CREATE INDEX "AttendanceLog_deviceUserId_idx" ON "AttendanceLog"("deviceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceLog_deviceUserId_punchTime_key" ON "AttendanceLog"("deviceUserId", "punchTime");

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_deviceUserId_fkey" FOREIGN KEY ("deviceUserId") REFERENCES "Employee"("deviceUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
