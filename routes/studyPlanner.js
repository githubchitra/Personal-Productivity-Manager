const express = require('express');
const router = express.Router();
const StudyPreferences = require('../models/StudyPreferences');
const StudyPlan = require('../models/StudyPlan');
const Attendance = require('../models/Attendance');
const OpenAI = require('openai');

// GET /study-planner - Main page
router.get('/', async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;

        let preferences = await StudyPreferences.findOne({ userId });
        if (!preferences) {
            preferences = new StudyPreferences({ userId });
            await preferences.save();
        }

        const startOfWeek = new Date();
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

        const currentPlan = await StudyPlan.findOne({
            userId,
            weekStartDate: { $gte: startOfWeek }
        }).sort({ createdAt: -1 });

        res.render('study-planner/index', {
            title: 'Study Planner',
            activeTab: 'study-planner',
            preferences: preferences.toObject(),
            currentPlan: currentPlan ? currentPlan.toObject() : null,
            user: { username: req.session.user.username }
        });
    } catch (err) {
        console.error('Error in study planner route:', err);
        res.status(500).render('error', { error: err.message });
    }
});

// API: POST /generate-plan
router.post('/generate-plan', async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const prefs = await StudyPreferences.findOne({ userId });

        if (!prefs || !prefs.focusSubjects || prefs.focusSubjects.length === 0) {
            return res.json({ success: false, error: "Please add at least one subject in the Preferences Panel first!" });
        }

        const attendance = await Attendance.find({ userId });

        const atRiskSubjects = attendance
            .filter(a => a.status !== 'safe')
            .map(a => `${a.subject} (${a.percentage}%)`);

        if (!process.env.OPENAI_API_KEY) {
            console.warn("⚠️ OpenAI API Key is missing. Using Mock Plan.");
            const mockPlan = mockGeneratePlan(prefs);
            const newPlan = new StudyPlan({
                userId,
                weekStartDate: new Date(),
                plan: mockPlan
            });
            await newPlan.save();
            return res.json({ success: true, plan: mockPlan });
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `Create a 7-day study plan. Subjects: ${prefs.focusSubjects.map(s => s.subject)}. Hours: ${prefs.dailyAvailableHours.monday}. Risks: ${atRiskSubjects}. Return JSON only.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });

        const aiOutput = JSON.parse(completion.choices[0].message.content);
        const newPlan = new StudyPlan({
            userId,
            weekStartDate: new Date(),
            plan: aiOutput.plan || aiOutput
        });

        await newPlan.save();
        res.json({ success: true, plan: newPlan.plan });

    } catch (err) {
        console.error('AI Generation Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: POST /study-planner/preferences
router.post('/preferences', async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const { dailyHours, focusSubjects, startDate, endDate } = req.body;

        const updatedPrefs = await StudyPreferences.findOneAndUpdate(
            { userId },
            {
                dailyAvailableHours: {
                    monday: dailyHours, tuesday: dailyHours, wednesday: dailyHours,
                    thursday: dailyHours, friday: dailyHours,
                    saturday: parseInt(dailyHours) + 2, sunday: parseInt(dailyHours) + 2
                },
                focusSubjects: JSON.parse(focusSubjects),
                startDate: new Date(startDate),
                endDate: new Date(endDate)
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, preferences: updatedPrefs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: GET /study-planner/ai-tip
router.get('/ai-tip', (req, res) => {
    const tips = [
        "Prioritize subjects with 'Critical' attendance risk first.",
        "Take a 5-minute break every 25 minutes.",
        "Practice Operating System shell commands practically.",
        "Your focus is highest in the first 45 minutes of study."
    ];
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    res.json({ tip: randomTip });
});

// API: GET /study-plan
router.get('/study-plan', async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const startOfWeek = new Date();
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

        const currentPlan = await StudyPlan.findOne({
            userId,
            weekStartDate: { $gte: startOfWeek }
        }).sort({ createdAt: -1 });

        res.json({ success: true, plan: currentPlan ? currentPlan.plan : null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

function mockGeneratePlan(prefs) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const subjects = prefs && prefs.focusSubjects && prefs.focusSubjects.length
        ? prefs.focusSubjects.map(s => s.subject)
        : [];

    if (subjects.length === 0) return [];

    return days.map(day => ({
        day,
        slots: Array(1).fill(0).map((_, i) => ({
            subject: subjects[i % subjects.length],
            duration: 2,
            startTime: '10:00 AM'
        }))
    }));
}
