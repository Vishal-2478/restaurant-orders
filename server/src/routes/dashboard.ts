import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDashboard } from '../services/dashboardService';

export const dashboardRouter = Router();

// Any signed-in member of staff can see the dashboard. The brief does not
// restrict it to managers, and a waiter benefits from knowing how many orders
// are open and how the evening is going.
dashboardRouter.use(requireAuth);

dashboardRouter.get('/', async (_req, res) => {
    res.json(await getDashboard());
});