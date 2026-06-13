import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcrypt';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set');
}
const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

async function main(): Promise<void> {
  console.log('Seeding database…');

  const adminPassword = await hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  const electronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: { name: 'Electronics', slug: 'electronics' },
  });
  const apparel = await prisma.category.upsert({
    where: { slug: 'apparel' },
    update: {},
    create: { name: 'Apparel', slug: 'apparel' },
  });
  const home = await prisma.category.upsert({
    where: { slug: 'home-and-garden' },
    update: {},
    create: { name: 'Home & Garden', slug: 'home-and-garden' },
  });

  await prisma.product.upsert({
    where: { slug: 'wireless-headphones' },
    update: {},
    create: {
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      description:
        'Over-ear Bluetooth headphones with active noise cancelling.',
      price: '79.99',
      stock: 50,
      categoryId: electronics.id,
      images: {
        create: [
          {
            url: 'https://placehold.co/800x800?text=Headphones',
            order: 0,
            storageKey: 'seed/headphones-0',
            mimeType: 'image/jpeg',
            sizeBytes: 0,
            status: 'READY',
          },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: 'classic-tee' },
    update: {},
    create: {
      name: 'Classic Tee',
      slug: 'classic-tee',
      description: '100% cotton crew-neck t-shirt.',
      price: '19.99',
      stock: 200,
      categoryId: apparel.id,
      images: {
        create: [
          {
            url: 'https://placehold.co/800x800?text=Tee',
            order: 0,
            storageKey: 'seed/tee-0',
            mimeType: 'image/jpeg',
            sizeBytes: 0,
            status: 'READY',
          },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: 'ceramic-planter' },
    update: {},
    create: {
      name: 'Ceramic Planter',
      slug: 'ceramic-planter',
      description: 'Hand-thrown 6-inch ceramic planter with drainage tray.',
      price: '34.5',
      stock: 30,
      categoryId: home.id,
      images: {
        create: [
          {
            url: 'https://placehold.co/800x800?text=Planter',
            order: 0,
            storageKey: 'seed/planter-0',
            mimeType: 'image/jpeg',
            sizeBytes: 0,
            status: 'READY',
          },
        ],
      },
    },
  });

  await prisma.discountCode.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', percentOff: 10 },
  });

  console.log(`Seeded admin user: ${admin.email}`);
  console.log('Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
