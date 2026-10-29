const db = require('../db');

// GET /api/students
exports.getStudents = async (req, res) => {
  try {
    const result = await db.query('SELECT student_id, email, full_name, board, grade, date_of_birth, guardian_email, created_at FROM students ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/students (Signup)
exports.createStudent = async (req, res) => {
  const { name, full_name, email, password, board, grade, dateOfBirth, date_of_birth, guardianEmail, guardian_email } = req.body;
  const studentName = full_name || name;
  const dob = date_of_birth || dateOfBirth;
  const parentEmail = guardian_email || guardianEmail;
  const cleanEmail = email ? email.trim().toLowerCase() : '';

  if (!cleanEmail || !studentName) {
    return res.status(400).json({ success: false, error: 'email and name are required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO students (email, full_name, password_hash, board, grade, date_of_birth, guardian_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         password_hash = COALESCE(EXCLUDED.password_hash, students.password_hash),
         board = EXCLUDED.board,
         grade = EXCLUDED.grade,
         date_of_birth = EXCLUDED.date_of_birth,
         guardian_email = EXCLUDED.guardian_email
       RETURNING student_id, email, full_name, board, grade, date_of_birth, guardian_email, created_at`,
      [cleanEmail, studentName, password || null, board || null, grade || null, dob || null, parentEmail || null]
    );

    console.log(`[Database] Student profile saved to PostgreSQL (twin_db): ${cleanEmail}`);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error saving student to PostgreSQL:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/login (Authentication against PostgreSQL)
exports.loginStudent = async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = email ? email.trim().toLowerCase() : '';

  if (!cleanEmail || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const result = await db.query('SELECT * FROM students WHERE LOWER(TRIM(email)) = $1', [cleanEmail]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'No account found with this email. Please sign up first!' });
    }

    const student = result.rows[0];

    // If password_hash is stored, check match (or match directly)
    if (student.password_hash && student.password_hash !== password) {
      return res.status(401).json({ success: false, error: 'Invalid password!' });
    }

    const { password_hash, ...studentProfile } = student;
    res.json({ success: true, message: 'Login successful!', user: studentProfile });
  } catch (err) {
    console.error('Error logging in student:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

const redisClient = require('../redisClient');

// GET /api/students/:student_id/top-struggles
exports.getTopStruggles = async (req, res) => {
  const { student_id } = req.params;
  const cacheKey = `struggles:${student_id}`;

  try {
    // 1. Check Redis Cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache Hit] Top struggles for ${student_id}`);
      return res.json(JSON.parse(cachedData));
    }

    // 2. Cache Miss: Fetch from FastAPI
    console.log(`[Cache Miss] Fetching struggles for ${student_id} from FastAPI...`);
    const fastApiUrl = `http://localhost:8000/api/v1/struggles/${student_id}`;
    
    const response = await fetch(fastApiUrl);
    if (!response.ok) {
      throw new Error(`FastAPI returned ${response.status}`);
    }
    
    const data = await response.json();

    // The react component expects an array of objects with { name: string, score: number } or similar
    // Let's check what TopStruggles.jsx expects: topic.topic_id || topic.name and topic.score.
    // FastAPI returns: { count: int, top_struggles: [ { topic, struggle_score, ... } ] }
    // So we map it to { name, score, topic_id }
    
    const mappedData = data.top_struggles.map(s => ({
      name: s.topic,
      score: Math.round(s.struggle_score * 100)
    }));

    // 3. Save to Cache
    await redisClient.set(cacheKey, JSON.stringify(mappedData), {
      EX: 3600 // cache for 1 hour by default
    });

    res.json(mappedData);
  } catch (err) {
    console.error('Error fetching top struggles:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/students/:student_id/revision/plan
exports.getRevisionPlan = async (req, res) => {
  const { student_id } = req.params;
  try {
    const fastApiUrl = `http://localhost:8000/api/v1/revision/${student_id}/plan`;
    const response = await fetch(fastApiUrl);
    if (!response.ok) {
      throw new Error(`FastAPI returned ${response.status}`);
    }
    const data = await response.json();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching revision plan:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/students/:student_id/revision/review
exports.recordRevisionReview = async (req, res) => {
  const { student_id } = req.params;
  const { schedule_id, quality_score } = req.body;
  try {
    const fastApiUrl = `http://localhost:8000/api/v1/revision/${student_id}/review`;
    const response = await fetch(fastApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_id, quality_score })
    });
    if (!response.ok) {
      throw new Error(`FastAPI returned ${response.status}`);
    }
    const data = await response.json();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error recording revision review:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/students/:student_id/revision/settings
exports.updateRevisionSettings = async (req, res) => {
  const { student_id } = req.params;
  const { max_daily_minutes } = req.body;
  try {
    const fastApiUrl = `http://localhost:8000/api/v1/revision/${student_id}/settings`;
    const response = await fetch(fastApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_daily_minutes })
    });
    if (!response.ok) {
      throw new Error(`FastAPI returned ${response.status}`);
    }
    const data = await response.json();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error updating revision settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/guardian/dashboard/:student_id
exports.getGuardianDashboard = async (req, res) => {
  const { student_id } = req.params;
  try {
    const fastApiUrl = `http://localhost:8000/api/v1/guardian/dashboard/${student_id}`;
    const response = await fetch(fastApiUrl);
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ success: false, error: errText });
    }
    const data = await response.json();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching guardian dashboard:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/guardian/students
exports.getGuardianStudents = async (req, res) => {
  const { guardian_email } = req.query;
  try {
    const fastApiUrl = `http://localhost:8000/api/v1/guardian/students${guardian_email ? `?guardian_email=${encodeURIComponent(guardian_email)}` : ''}`;
    const response = await fetch(fastApiUrl);
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ success: false, error: errText });
    }
    const data = await response.json();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Error fetching guardian students:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};


