import { prisma } from '../src/db';
import { hashPassword } from '../src/lib/password';

// Demo credentials. These are recorded in SUBMISSION.md so a reviewer can sign in,
// which is why they are deliberately obvious rather than strong.
const DEMO_PASSWORD = 'Password123!';

const STAFF = [
    { email: 'manager@restaurant.test', name: 'Priya Menon', role: 'MANAGER' as const },
    { email: 'waiter.a@restaurant.test', name: 'Arjun Rao', role: 'WAITER' as const },
    { email: 'waiter.b@restaurant.test', name: 'Beatrice Kim', role: 'WAITER' as const },
];

const MENU = [
    { name: 'Masala Papad', category: 'Starters', priceCents: 12000, description: 'Crisp papad, onion, tomato, chaat masala' },
    { name: 'Paneer Tikka', category: 'Starters', priceCents: 32000, description: 'Char-grilled cottage cheese, mint chutney' },
    { name: 'Chicken 65', category: 'Starters', priceCents: 34000, description: 'Curry leaf, chilli, yoghurt marinade' },
    { name: 'Dal Makhani', category: 'Mains', priceCents: 28000, description: 'Black lentils, slow cooked overnight' },
    { name: 'Butter Chicken', category: 'Mains', priceCents: 42000, description: 'Tandoori chicken in tomato and cream' },
    { name: 'Veg Biryani', category: 'Mains', priceCents: 34000, description: 'Seasonal vegetables, saffron, raita' },
    { name: 'Mutton Rogan Josh', category: 'Mains', priceCents: 48000, description: 'Kashmiri chillies, fennel, ginger' },
    { name: 'Garlic Naan', category: 'Breads', priceCents: 8000, description: null },
    { name: 'Laccha Paratha', category: 'Breads', priceCents: 7000, description: null },
    { name: 'Jeera Rice', category: 'Sides', priceCents: 15000, description: null },
    { name: 'Gulab Jamun', category: 'Desserts', priceCents: 14000, description: 'Two pieces, warm' },
    { name: 'Masala Chai', category: 'Drinks', priceCents: 6000, description: null },
    { name: 'Fresh Lime Soda', category: 'Drinks', priceCents: 9000, description: 'Sweet, salted or mixed' },
    { name: 'Seasonal Special', category: 'Mains', priceCents: 39000, description: 'Currently unavailable', available: false },
];

async function main() {
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    for (const person of STAFF) {
        await prisma.user.upsert({
            where: { email: person.email },
            update: { name: person.name, role: person.role, isActive: true },
            create: { ...person, passwordHash },
        });
    }
    console.log(`Seeded ${STAFF.length} staff accounts (password: ${DEMO_PASSWORD})`);

    for (const item of MENU) {
        const existing = await prisma.menuItem.findFirst({ where: { name: item.name } });
        const data = {
            name: item.name,
            description: item.description,
            category: item.category,
            priceCents: item.priceCents,
            isAvailable: item.available ?? true,
        };

        if (existing) {
            await prisma.menuItem.update({ where: { id: existing.id }, data });
        } else {
            await prisma.menuItem.create({ data });
        }
    }
    console.log(`Seeded ${MENU.length} menu items`);
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
        console.error(err);
        await prisma.$disconnect();
        process.exit(1);
    });