import { Router } from 'express';
import { getMenu, addDish, updateDish, deleteDish } from '../controllers/menu';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { addDishSchema, deleteDishSchema, updateDishSchema } from '../validators/menu.validator';

const router = Router();
router.use(requireAuth);

router.get('/', getMenu);
router.post('/', validate(addDishSchema), addDish);
router.put('/:id', validate(updateDishSchema), updateDish);
router.delete('/:id', validate(deleteDishSchema), deleteDish);

export default router;
