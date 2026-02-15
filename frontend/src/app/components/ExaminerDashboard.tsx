
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  FileText, 
  Users, 
  BarChart, 
  Plus, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Play
} from "lucide-react";
import * as api from "../../lib/api";
import { LiveStatCard } from "./LiveStatCard";

export function ExaminerDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    activeExams: 0,
    totalStudents: 0,
    activeStudents: 0,
    flaggedSubmissions: 0,
    averageScore: 0
  });
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
        const [examsRes, statsRes] = await Promise.all([
            api.getMyExams(),
            api.getExaminerStats()
        ]);

        if (examsRes.success) {
            setExams(examsRes.data);
        }
        
        if (statsRes.success) {
            setStats(prev => ({
                ...prev,
                ...statsRes.data
            }));
        }
    } catch (e) {
        console.error("Failed to load dashboard:", e);
    } finally {
        setLoading(false);
        setRefreshing(false);
    }
  };

  useEffect(() => {
    // Initial load
    loadDashboardData();

    // Auto-refresh every 30 seconds (reduced frequency since we have manual refresh)
    const interval = setInterval(() => loadDashboardData(), 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Examiner Dashboard</h1>
          <p className="text-slate-600">Manage exams and monitor student progress</p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={() => loadDashboardData(true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition shadow-sm disabled:opacity-70"
            >
                <div className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                </div>
                {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <Link 
            to="/exam/create" 
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm"
            >
            <Plus className="w-5 h-5" />
            Create New Exam
            </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard 
          icon={FileText} 
          label="My Exams" 
          value={exams.length} 
          color="bg-blue-50 text-blue-600" 
        />
        <LiveStatCard 
            icon={Users} 
            label="Active Students" 
            fetchValue={async () => {
                const res = await api.getExaminerStats();
                return res.success ? res.data.activeStudents : 0;
            }}
            initialValue={stats.activeStudents}
            pollingInterval={5000}
            color="bg-purple-50 text-purple-600" 
            tooltip="Updates automatically every 5s"
        />
        <StatCard 
          icon={AlertTriangle} 
          label="Flagged Submissions" 
          value={stats.flaggedSubmissions} 
          color="bg-amber-50 text-amber-600"
          tooltip="Submitted/auto-submitted exams flagged by suspicious behavior or violations"
        />
        <StatCard 
          icon={BarChart} 
          label="Avg. Score" 
          value={stats.averageScore > 0 ? `${Math.round(stats.averageScore)}%` : '-'} 
          color="bg-green-50 text-green-600" 
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: My Exams List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-800">My Exams</h2>
            <Link to="/examiner/exams" className="text-sm text-blue-600 hover:underline">View All</Link>
          </div>
          
          <div className="divide-y divide-slate-100">
            {exams.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                    You haven't created any exams yet.
                </div>
            ) : (
                exams.slice(0, 5).map((exam) => (
                    <div key={exam._id} className="p-4 hover:bg-slate-50 transition flex items-center justify-between group">
                        <div className="flex-1">
                            <Link to={`/examiner/monitor?examId=${exam._id}`} className="block">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-semibold text-slate-800 hover:text-blue-600 transition-colors">{exam.title}</h3>
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                                        exam.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                        {exam.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {exam.duration} min
                                    </span>
                                    <span>
                                        Created: {new Date(exam.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </Link>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => navigate(`/examiner/monitor?examId=${exam._id}`)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Monitor"
                            >
                                <Play className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => navigate(`/examiner/reports?examId=${exam._id}`)}
                                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="Reports"
                            >
                                <BarChart className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>
        
        {/* Right Column: Quick Actions */}
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 text-slate-800">Quick Actions</h2>
                <div className="space-y-3">
                    <ActionButton 
                        icon={Users} 
                        label="Monitor Active Exams" 
                        desc="View live exam sessions" 
                        onClick={() => navigate('/examiner/monitor')}
                    />
                    <ActionButton 
                        icon={CheckCircle} 
                        label="Integrity Reports" 
                        desc="Inspect flagged sessions"
                        onClick={() => navigate('/examiner/reports')} 
                    />
                </div>
            </div>
            
            {/* Guide Box */}
             <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                <h3 className="font-semibold text-blue-900 mb-2">Examiner Guide</h3>
                <ul className="text-sm text-blue-800 space-y-2 list-disc list-inside">
                    <li>Create exams with strict proctoring rules.</li>
                    <li>Monitor students in real-time.</li>
                    <li>Use integrity reports to investigate suspicious sessions.</li>
                </ul>
            </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, tooltip }: any) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 relative group cursor-help">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{label}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      </div>
      {tooltip && (
          <div className="absolute top-full text-center mt-2 left-1/2 -translate-x-1/2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {tooltip}
          </div>
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, label, desc, onClick }: any) {
  return (
    <button 
        onClick={onClick}
        className="w-full flex flex-col items-start p-4 border border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-left"
    >
      <div className="p-2 bg-slate-100 rounded-md mb-3 text-slate-600">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-semibold text-slate-800">{label}</h3>
      <p className="text-xs text-slate-500 mt-1">{desc}</p>
    </button>
  );
}
