-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "clientAFullName" TEXT NOT NULL,
    "clientAIdNumber" TEXT NOT NULL,
    "clientAPhone" TEXT NOT NULL,
    "clientAEmail" TEXT,
    "clientAAddress" TEXT,
    "clientBFullName" TEXT,
    "clientBIdNumber" TEXT,
    "clientBPhone" TEXT,
    "clientBEmail" TEXT,
    "clientBAddress" TEXT,
    "calendarDateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timeOfDay" TEXT,
    "guestCount" INTEGER NOT NULL,
    "finalPricePortion" DOUBLE PRECISION NOT NULL,
    "managerComments" TEXT,
    "clientComments" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
