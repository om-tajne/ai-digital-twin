const express = require('express');

const router = express.Router();

const studentController = require('../controllers/studentController');
const paymentRoutes = require('./paymentRoutes');

router.get('/students', studentController.getStudents);

router.post('/students', studentController.createStudent);

router.post('/login', studentController.loginStudent);

router.get('/students/:student_id/top-struggles', studentController.getTopStruggles);
router.get('/guardian/dashboard/:student_id', studentController.getGuardianDashboard);
router.get('/guardian/students', studentController.getGuardianStudents);

router.use('/payment', paymentRoutes);

module.exports = router;
