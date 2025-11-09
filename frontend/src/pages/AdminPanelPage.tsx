// frontend/src/pages/AdminPanelPage.tsx
import { useState, useEffect, useRef } from 'react';
import {
  Chart,
  LineController,
  BarController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css'; // Import the styles
import Sidebar from '../components/Sidebar'; // <-- *** IMPORT THE SIDEBAR ***

// Register Chart.js components
Chart.register(
  LineController,
  BarController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

// Set default chart.js styles
Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.color = '#4b5563'; // text-secondary

type AdminTab = 'usage' | 'queue' | 'logging' | 'knowledge' | 'ai_settings' | 'user_management';

// Helper component for file uploader
const FileUploader = ({ types }: { types: string }) => (
  <div className="w-full border-2 border-dashed border-border rounded-lg bg-bg-medium p-8 text-center cursor-pointer hover:border-primary">
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-text-muted mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
    <p className="text-sm font-semibold text-text-secondary">Click to upload or drag and drop</p>
    <p className="text-xs text-text-muted mt-1">{types}</p>
  </div>
);

export default function AdminPanelPage() {
  // (A2) State for active tab
  const [activeTab, setActiveTab] = useState<AdminTab>('usage');
  
  // State for all modals
  const [modals, setModals] = useState({
    logDetails: false,
    exportLogs: false,
    editDictionary: false,
    deleteDictionaryConfirm: false,
    addSimMethod: false,
    addUser: false,
    editUser: false,
    deleteUserConfirm: false,
    promptHistory: false,
  });

  // (A15-A21) State for AI settings
  const [mainLLMTemp, setMainLLMTemp] = useState(0.7);
  const [backupLLMTemp, setBackupLLMTemp] = useState(0.7);
  const [askAiEnabled, setAskAiEnabled] = useState(true);
  
  // (A5) State for Model Filter
  const [modelFilterOpen, setModelFilterOpen] = useState(false);

  // Refs for charts and datepicker
  const apiRequestsChartRef = useRef<HTMLCanvasElement>(null);
  const tokenUsageChartRef = useRef<HTMLCanvasElement>(null);
  const waitTimeChartRef = useRef<HTMLCanvasElement>(null);
  const dateRangeRef = useRef<HTMLInputElement>(null);
  const datePickerInstance = useRef<flatpickr.Instance | null>(null);

  // Helper to manage modals
  const openModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: true }));
  const closeModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: false }));

  // (A3) Effect to initialize dummy charts
  useEffect(() => {
    const chartInstances: Chart[] = [];

    if (activeTab === 'usage') {
      // Init API Requests Chart
      if (apiRequestsChartRef.current) {
        const apiChart = new Chart(apiRequestsChartRef.current, {
          type: 'line',
          data: {
            labels: ['Oct 18', 'Oct 19', 'Oct 20', 'Oct 21', 'Oct 22', 'Oct 23', 'Oct 24'],
            datasets: [
              { label: 'GPT-4', data: [120, 150, 180, 220, 190, 240, 260], borderColor: '#068c81', backgroundColor: 'rgba(6, 140, 129, 0.1)', tension: 0.2, fill: true },
              { label: 'Claude 3 Opus', data: [80, 90, 100, 110, 95, 115, 130], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.2, fill: true }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } }, x: { grid: { display: false } } } }
        });
        chartInstances.push(apiChart);
      }
      // Init Token Usage Chart
      if (tokenUsageChartRef.current) {
        const tokenChart = new Chart(tokenUsageChartRef.current, {
          type: 'bar',
          data: {
            labels: ['Oct 18', 'Oct 19', 'Oct 20', 'Oct 21', 'Oct 22', 'Oct 23', 'Oct 24'],
            datasets: [
              { label: 'Input Tokens', data: [50000, 60000, 55000, 70000, 65000, 75000, 80000], backgroundColor: '#3b82f6', borderRadius: 4 },
              { label: 'Output Tokens', data: [20000, 25000, 22000, 30000, 28000, 32000, 35000], backgroundColor: '#068c81', borderRadius: 4 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: '#f3f4f6' } } } }
        });
        chartInstances.push(tokenChart);
      }
      // Init Wait Time Chart
      if (waitTimeChartRef.current) {
        const waitChart = new Chart(waitTimeChartRef.current, {
          type: 'bar',
          data: {
            labels: ['GPT-4o', 'Claude 3 Opus', 'Gemini Pro'],
            datasets: [{ label: 'Avg. Wait Time (s)', data: [15.2, 12.5, 18.1], backgroundColor: ['#068c81', '#3b82f6', '#f59e0b'], borderRadius: 4 }]
          },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, title: { display: true, text: 'Seconds' }, grid: { color: '#f3f4f6' } }, y: { grid: { display: false } } } }
        });
        chartInstances.push(waitChart);
      }
    }
    // Cleanup function
    return () => {
      chartInstances.forEach(chart => chart.destroy());
    };
  }, [activeTab]);

  // (A4) Effect to initialize date picker
  useEffect(() => {
    if (activeTab === 'usage' && dateRangeRef.current && !datePickerInstance.current) {
      datePickerInstance.current = flatpickr(dateRangeRef.current, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        defaultDate: [new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'today'],
        altInput: true,
        altFormat: 'M j, Y',
      });
    }
    // No cleanup function needed here as we want to preserve the instance
  }, [activeTab]);


  return (
    // This is the root layout
    <div className="flex h-screen bg-bg-light">
      
      {/* 1. Sidebar Component */}
      <Sidebar />

      {/* This is the main content area for the admin panel */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Global Header */}
        <header className="flex-shrink-0 flex items-center justify-between h-16 px-6 border-b border-border bg-bg-light z-10">
          <h2 className="text-xl font-bold text-text-primary">Admin Panel</h2>
        </header>

        {/* Tab Navigation (A2) */}
        <div className="flex-shrink-0 border-b border-border bg-bg-light">
          <nav className="flex -mb-px px-6">
            <button onClick={() => setActiveTab('usage')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'usage' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>Usage Dashboard</button>
            <button onClick={() => setActiveTab('queue')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'queue' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>Queue Dashboard</button>
            <button onClick={() => setActiveTab('logging')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'logging' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>Comprehensive Logging</button>
            <button onClick={() => setActiveTab('knowledge')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'knowledge' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>Knowledge Base</button>
            <button onClick={() => setActiveTab('ai_settings')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'ai_settings' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>AI Settings</button>
            <button onClick={() => setActiveTab('user_management')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'user_management' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>User Management</button>
          </nav>
        </div>

        {/* Tab Content Area (Scrollable) */}
        <main className="flex-1 overflow-y-auto main-content-scroll p-6 lg:p-8 space-y-8">

          {/* Usage Dashboard Tab (A3, A4, A5) */}
          {activeTab === 'usage' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-text-primary">Usage Dashboard</h3>
              {/* Filters */}
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex-1 flex-wrap flex items-center gap-2">
                  <label className="text-sm font-medium text-text-muted mr-2">Date Range:</label>
                  <div className="relative inline-block">
                    <input ref={dateRangeRef} type="text" placeholder="Select date range..." className="w-64 rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm cursor-pointer"/>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                  </div>
                  <div className="inline-flex rounded-md shadow-sm border border-gray-200 divide-x divide-gray-200" role="group">
                    <button type="button" onClick={() => datePickerInstance.current?.setDate('today', true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100 rounded-l-md">Today</button>
                    <button type="button" onClick={() => datePickerInstance.current?.setDate([new Date(new Date().setDate(new Date().getDate()-1)), new Date(new Date().setDate(new Date().getDate()-1))], true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100">Yesterday</button>
                    <button type="button" onClick={() => datePickerInstance.current?.setDate([new Date(new Date().setDate(new Date().getDate()-6)), 'today'], true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100">Last 7d</button>
                    <button type="button" onClick={() => datePickerInstance.current?.setDate([new Date(new Date().setDate(new Date().getDate()-29)), 'today'], true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100">Last 30d</button>
                    <button type="button" onClick={() => datePickerInstance.current?.setDate([new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'today'], true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100 rounded-r-md">This Month</button>
                  </div>
                </div>

                <div 
                  className="relative inline-block text-left"
                  onMouseLeave={() => setModelFilterOpen(false)}
                >
                  <div>
                    <button type="button" onClick={() => setModelFilterOpen(!modelFilterOpen)} className="inline-flex justify-center w-full rounded-md border border-border shadow-sm px-4 py-2 bg-white text-sm font-medium text-text-secondary hover:bg-bg-medium">
                      Models
                      <svg className="-mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                  </div>
                  {modelFilterOpen && (
                    <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10 p-2">
                      <input type="text" placeholder="Search models..." className="w-full mb-2 rounded-md border border-border px-2 py-1 text-sm"/>
                      <div className="py-1 space-y-1 max-h-48 overflow-y-auto">
                        <label className="flex items-center px-2 py-1 text-sm text-text-secondary rounded-md hover:bg-bg-medium cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mr-2"/> GPT-4
                        </label>
                        <label className="flex items-center px-2 py-1 text-sm text-text-secondary rounded-md hover:bg-bg-medium cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mr-2"/> Claude 3 Opus
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dashboard Stats (A3) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <h4 className="text-md font-semibold text-text-primary mb-4">AI API Requests</h4>
                  <div className="h-64"><canvas ref={apiRequestsChartRef}></canvas></div>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <h4 className="text-md font-semibold text-text-primary mb-4">Token Usage</h4>
                  <div className="h-64"><canvas ref={tokenUsageChartRef}></canvas></div>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <h4 className="text-md font-semibold text-text-primary mb-4">Avg. Wait Time (per Model)</h4>
                  <div className="h-64"><canvas ref={waitTimeChartRef}></canvas></div>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border flex flex-col items-center justify-center">
                  <h4 className="text-md font-semibold text-text-primary mb-2">Error Rate</h4>
                  <p className="text-4xl font-bold text-error">1.2%</p>
                  <p className="text-xs text-text-muted mt-1">Based on selected period</p>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border flex flex-col items-center justify-center">
                  <h4 className="text-md font-semibold text-text-primary mb-2">Total Estimated Cost</h4>
                  <p className="text-4xl font-bold text-text-primary">$123.45</p>
                  <p className="text-xs text-text-muted mt-1">Based on selected period</p>
                </div>
              </div>
            </div>
          )}

          {/* Queue Dashboard Tab (A6) */}
          {activeTab === 'queue' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-text-primary">Queue Dashboard</h3>
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                <p className="text-sm text-text-muted mb-4">(Placeholder for BullMQ UI)</p>
                {/* ... (Placeholder table from mockup) ... */}
              </div>
            </div>
          )}

          {/* Comprehensive Logging Tab (A7-A10) */}
          {activeTab === 'logging' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-text-primary">Comprehensive Logging</h3>
                <button onClick={() => openModal('exportLogs')} className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export Logs
                </button>
              </div>
              {/* Log Table (A7) */}
              <div className="overflow-x-auto border border-border rounded-lg bg-bg-light shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-bg-medium border-b border-border">
                      <th className="p-3 font-semibold text-text-secondary cursor-pointer hover:bg-border/30">Timestamp <span className="text-xs">▼</span></th>
                      <th className="p-3 font-semibold text-text-secondary cursor-pointer hover:bg-border/30">User</th>
                      <th className="p-3 font-semibold text-text-secondary cursor-pointer hover:bg-border/30">Report ID</th>
                      <th className="p-3 font-semibold text-text-secondary cursor-pointer hover:bg-border/30">Model Used</th>
                      <th className="p-3 font-semibold text-text-secondary cursor-pointer hover:bg-border/30">Tokens (In → Out)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border hover:bg-bg-medium cursor-pointer" onClick={() => openModal('logDetails')}>
                      <td className="p-3 whitespace-nowrap">Oct 24, 2025 10:30:15 AM</td>
                      <td className="p-3">john.doe</td>
                      <td className="p-3">RPT-001</td>
                      <td className="p-3">gpt-4</td>
                      <td className="p-3">1200 → 350</td>
                    </tr>
                    <tr className="hover:bg-bg-medium cursor-pointer" onClick={() => openModal('logDetails')}>
                      <td className="p-3 whitespace-nowrap">Oct 24, 2025 09:15:00 AM</td>
                      <td className="p-3">jane.smith</td>
                      <td className="p-3">RPT-002</td>
                      <td className="p-3">claude-3</td>
                      <td className="p-3">800 → 200</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Knowledge Base Tab (A11-A14) */}
          {activeTab === 'knowledge' && (
            <div className="space-y-8">
              <h3 className="text-lg font-semibold text-text-primary">Knowledge Base Management</h3>
              {/* General Knowledge Files (A12) */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-4">
                <h4 className="text-md font-semibold text-text-primary">General Knowledge Files</h4>
                <p className="text-sm text-text-muted">Upload general documents (.pdf, .docx, .txt) to be available to all AI requests.</p>
                <FileUploader types="PDF, DOCX, or TXT" />
                <div>
                  <h5 className="text-sm font-medium text-text-primary mb-2">Uploaded Files:</h5>
                  <ul className="space-y-2">
                    <li className="flex justify-between items-center text-sm p-2 bg-bg-medium rounded-md">
                      <span>Company_Values_Handbook.pdf (Oct 23, 2025)</span>
                      <button className="text-xs text-primary hover:underline">Download</button>
                    </li>
                  </ul>
                </div>
              </div>
              {/* Competency Dictionaries (A13) */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-4">
                <h4 className="text-md font-semibold text-text-primary">Competency Dictionaries</h4>
                <p className="text-sm text-text-muted">Upload competency definitions (.json format). These will be selectable when creating projects.</p>
                <FileUploader types="JSON only" />
                <div>
                  <input type="text" placeholder="Search dictionaries..." className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm mb-2"/>
                  <ul className="space-y-2">
                    <li className="flex justify-between items-center text-sm p-3 border border-border rounded-md hover:bg-bg-medium cursor-pointer" onClick={() => openModal('editDictionary')}>
                      <div>
                        <span className="font-medium text-text-primary">Standard Leadership Dictionary v2</span>
                        <span className="text-xs text-text-muted ml-2">(Added: Oct 20, 2025)</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); openModal('deleteDictionaryConfirm'); }} className="text-xs text-error/80 hover:text-error">Delete</button>
                    </li>
                  </ul>
                </div>
              </div>
              {/* Simulation Methods Data (A14) */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-4">
                <h4 className="text-md font-semibold text-text-primary">Simulation Methods Data</h4>
                <p className="text-sm text-text-muted">Upload data files (.pdf, .docx, .txt) associated with specific simulation methods.</p>
                <FileUploader types="PDF, DOCX, or TXT" />
                <button onClick={() => openModal('addSimMethod')} className="text-sm text-primary hover:underline">+ Add New Simulation Method Type</button>
                <div>
                  <h5 className="text-sm font-medium text-text-primary mb-2">Uploaded Method Data:</h5>
                  <ul className="space-y-2">
                    <li className="flex justify-between items-center text-sm p-2 bg-bg-medium rounded-md">
                      <span>CaseStudy_MarketEntry.pdf (Case Study)</span>
                      <button className="text-xs text-primary hover:underline">Download</button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* AI Settings Tab (A15-A21) */}
          {activeTab === 'ai_settings' && (
            <div className="space-y-8">
              <h3 className="text-lg font-semibold text-text-primary">AI Model & Prompt Settings</h3>
              {/* LLM Selection (A16, A17) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <label htmlFor="main-llm" className="block text-md font-semibold text-text-primary mb-2">Main LLM</label>
                  <select id="main-llm" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm">
                    <option>openrouter/openai/gpt-4o</option>
                    <option>openrouter/anthropic/claude-3-opus</option>
                  </select>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <label htmlFor="backup-llm" className="block text-md font-semibold text-text-primary mb-2">Backup LLM</label>
                  <select id="backup-llm" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm">
                    <option>openrouter/anthropic/claude-3-opus</option>
                  </select>
                </div>
              </div>
              {/* Temperature (A18, A19) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <label htmlFor="main-temp" className="block text-md font-semibold text-text-primary mb-2">Main LLM Temperature</label>
                  <div className="flex items-center gap-4">
                    <input type="range" id="main-temp" min="0" max="1" step="0.1" value={mainLLMTemp} onChange={(e) => setMainLLMTemp(parseFloat(e.target.value))} className="w-full" />
                    <span className="text-sm font-medium text-text-primary w-10 text-right">{mainLLMTemp}</span>
                  </div>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <label htmlFor="backup-temp" className="block text-md font-semibold text-text-primary mb-2">Backup LLM Temperature</label>
                  <div className="flex items-center gap-4">
                    <input type="range" id="backup-temp" min="0" max="1" step="0.1" value={backupLLMTemp} onChange={(e) => setBackupLLMTemp(parseFloat(e.target.value))} className="w-full" />
                    <span className="text-sm font-medium text-text-primary w-10 text-right">{backupLLMTemp}</span>
                  </div>
                </div>
              </div>
              {/* Default Prompts (A20) */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-4">
                <h4 className="text-md font-semibold text-text-primary">Default Prompts</h4>
                <div>
                  <div className="flex justify-between items-center">
                    <label htmlFor="prompt-persona" className="block text-sm font-medium text-text-secondary mb-1">Persona (System Prompt)</label>
                    <button onClick={() => openModal('promptHistory')} className="text-xs font-medium text-primary hover:underline">View Version History</button>
                  </div>
                  <textarea id="prompt-persona" rows={3} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm"></textarea>
                </div>
                <div>
                  <div className="flex justify-between items-center">
                    <label htmlFor="prompt-evidence" className="block text-sm font-medium text-text-secondary mb-1">Evidence Collection</label>
                    <button onClick={() => openModal('promptHistory')} className="text-xs font-medium text-primary hover:underline">View Version History</button>
                  </div>
                  <textarea id="prompt-evidence" rows={4} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm"></textarea>
                </div>
                <div>
                  <div className="flex justify-between items-center">
                    <label htmlFor="prompt-analysis" className="block text-sm font-medium text-text-secondary mb-1">Competency Analysis</label>
                    <button onClick={() => openModal('promptHistory')} className="text-xs font-medium text-primary hover:underline">View Version History</button>
                  </div>
                  <textarea id="prompt-analysis" rows={4} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm"></textarea>
                </div>
                <div>
                  <div className="flex justify-between items-center">
                    <label htmlFor="prompt-summary" className="block text-sm font-medium text-text-secondary mb-1">Executive Summary</label>
                    <button onClick={() => openModal('promptHistory')} className="text-xs font-medium text-primary hover:underline">View Version History</button>
                  </div>
                  <textarea id="prompt-summary" rows={4} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm"></textarea>
                </div>
                <div className="flex justify-end">
                  <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors">Save Default Prompts</button>
                </div>
              </div>
              {/* 'Ask AI' Settings (A21) */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-md font-semibold text-text-primary">'Ask AI' (Fine-Tune) Feature</h4>
                  <button type="button" onClick={() => setAskAiEnabled(!askAiEnabled)} className={`relative inline-flex items-center h-6 rounded-full w-11 ${askAiEnabled ? 'bg-primary' : 'bg-gray-200'}`}>
                    <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition ${askAiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {askAiEnabled && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div>
                      <label htmlFor="ask-ai-llm" className="block text-sm font-medium text-text-secondary mb-1">'Ask AI' LLM</label>
                      <select id="ask-ai-llm" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm">
                        <option>openrouter/anthropic/claude-3-opus</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="prompt-ask-ai" className="block text-sm font-medium text-text-secondary mb-1">'Ask AI' System Prompt</label>
                      <textarea id="prompt-ask-ai" rows={4} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm"></textarea>
                    </div>
                    <div className="flex justify-end">
                      <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors">Save 'Ask AI' Settings</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User Management Tab (A22-A24) */}
          {activeTab === 'user_management' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-text-primary">User Management</h3>
                <button onClick={() => openModal('addUser')} className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover flex items-center gap-2">
                  + Add User
                </button>
              </div>
              {/* User Table (A22) */}
              <div className="overflow-x-auto border border-border rounded-lg bg-bg-light shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-bg-medium border-b border-border">
                      <th className="p-3 font-semibold text-text-secondary">User Name</th>
                      <th className="p-3 font-semibold text-text-secondary">User Role</th>
                      <th className="p-3 font-semibold text-text-secondary text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border hover:bg-bg-medium cursor-pointer" onClick={() => openModal('editUser')}>
                      <td className="p-3 font-medium text-text-primary">Admin User</td>
                      <td className="p-3"><span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">Admin</span></td>
                      <td className="p-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); openModal('deleteUserConfirm'); }} className="text-xs text-error/80 hover:text-error">Delete</button>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-bg-medium cursor-pointer" onClick={() => openModal('editUser')}>
                      <td className="p-3 font-medium text-text-primary">Jane Doe</td>
                      <td className="p-3"><span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">Project Manager</span></td>
                      <td className="p-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); openModal('deleteUserConfirm'); }} className="text-xs text-error/80 hover:text-error">Delete</button>
                      </td>
                    </tr>
                    <tr className="hover:bg-bg-medium cursor-pointer" onClick={() => openModal('editUser')}>
                      <td className="p-3 font-medium text-text-primary">John Smith</td>
                      <td className="p-3"><span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">User</span></td>
                      <td className="p-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); openModal('deleteUserConfirm'); }} className="text-xs text-error/80 hover:text-error">Delete</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* --- MODALS --- */}

      {/* Log Details Modal (A9) */}
      {modals.logDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40" onClick={() => closeModal('logDetails')}>
          <div className="w-full max-w-3xl bg-bg-light rounded-lg shadow-lg flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-xl font-semibold text-text-primary">Log Entry Details</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('logDetails')}>&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
                <div><strong className="text-text-muted">Timestamp:</strong> <span>Oct 24, 10:30:15</span></div>
                <div><strong className="text-text-muted">User:</strong> <span>john.doe</span></div>
                <div><strong className="text-text-muted">Report ID:</strong> <span>RPT-001</span></div>
                <div><strong className="text-text-muted">Model Used:</strong> <span>gpt-4</span></div>
                <div className="md:col-span-2"><strong className="text-text-muted">Tokens (In → Out):</strong> <span>1200 → 350</span></div>
              </div>
              <h4 className="text-md font-semibold text-text-primary border-t border-border pt-4">AI Interactions</h4>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-bg-medium border-b border-border">
                      <th className="p-2 font-semibold text-text-secondary w-1/3">Prompt</th>
                      <th className="p-2 font-semibold text-text-secondary w-1/3">Output</th>
                      <th className="p-2 font-semibold text-text-secondary w-1/3">Edited Text</th>
                      <th className="p-2 font-semibold text-text-secondary">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border align-top">
                      <td className="p-2"><div className="max-h-24 overflow-y-auto">[Initial prompt...]</div></td>
                      <td className="p-2"><div className="max-h-24 overflow-y-auto">[Generated evidence...]</div></td>
                      <td className="p-2">-</td>
                      <td className="p-2">800 → 200</td>
                    </tr>
                    <tr className="align-top">
                      <td className="p-2"><div className="max-h-24 overflow-y-auto">Refine: Make concise.</div></td>
                      <td className="p-2"><div className="max-h-24 overflow-y-auto">[Refined reasoning...]</div></td>
                      <td className="p-2"><div className="max-h-24 overflow-y-auto">[Manual user edit...]</div></td>
                      <td className="p-2">50 → 30</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-4 bg-bg-medium border-t border-border flex justify-end">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2" onClick={() => closeModal('logDetails')}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Export Logs Modal (A10) */}
      {modals.exportLogs && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40" onClick={() => closeModal('exportLogs')}>
          <div className="w-full max-w-2xl bg-bg-light rounded-lg shadow-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-xl font-semibold text-text-primary">Export Comprehensive Logs</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('exportLogs')}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              {/* ... (Date Range Picker) ... */}
              <div>
                <label htmlFor="export-format" className="text-sm font-medium text-text-primary mb-1 block">Export Format:</label>
                <select id="export-format" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm">
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </div>
            </div>
            <div className="p-4 bg-bg-medium border-t border-border flex justify-end gap-3">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2" onClick={() => closeModal('exportLogs')}>Cancel</button>
              <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2">Export</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit User Modal (A22, A23, A24) */}
      {(modals.addUser || modals.editUser) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40" onClick={() => { closeModal('addUser'); closeModal('editUser'); }}>
          <div className="w-full max-w-lg bg-bg-light rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-xl font-semibold text-text-primary">{modals.addUser ? 'Add New User' : 'Edit User Details'}</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => { closeModal('addUser'); closeModal('editUser'); }}>&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="user-name" className="block text-sm font-medium text-text-secondary mb-1">User Name:</label>
                <input type="text" id="user-name" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm" />
              </div>
              <div>
                <label htmlFor="user-email" className="block text-sm font-medium text-text-secondary mb-1">User Email:</label>
                <input type="email" id="user-email" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm" />
              </div>
              <div>
                <label htmlFor="user-password" className="block text-sm font-medium text-text-secondary mb-1">Password:</label>
                <input type="password" id="user-password" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm" placeholder={modals.editUser ? 'Leave blank to keep current' : ''}/>
              </div>
              <div>
                <label htmlFor="user-role" className="block text-sm font-medium text-text-secondary mb-1">User Role:</label>
                <select id="user-role" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm">
                  <option value="user">User</option>
                  <option value="project manager">Project Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="p-4 bg-bg-medium border-t border-border flex justify-end gap-3">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2" onClick={() => { closeModal('addUser'); closeModal('editUser'); }}>Cancel</button>
              <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2">{modals.addUser ? 'Add User' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ... (Other modals: editDictionary, deleteDictionaryConfirm, addSimMethod, deleteUserConfirm, promptHistory) ... */}

    </div>
  );
}