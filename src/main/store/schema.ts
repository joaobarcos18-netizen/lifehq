import type {
  Achievement,
  Expense,
  ExpenseCategory,
  FileCategory,
  FitnessLog,
  Goal,
  Photo,
  PhotoBlock,
  SortedFile,
  WorldRegion
} from '@shared/types'

export interface DatabaseShape {
  files: SortedFile[]
  fileCategories: FileCategory[]
  achievements: Achievement[]
  goals: Goal[]
  fitnessLogs: FitnessLog[]
  expenses: Expense[]
  expenseCategories: ExpenseCategory[]
  photos: Photo[]
  photoBlocks: PhotoBlock[]
  regions: WorldRegion[]
}

/** Built-in file categories — the "chests" the sorter drops files into. */
export const SEED_FILE_CATEGORIES: FileCategory[] = [
  {
    id: 'documents',
    name: 'Documents',
    color: '#5bb8e6',
    icon: 'FileText',
    description: 'General documents, letters and notes',
    extensions: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'],
    keywords: ['letter', 'document', 'note', 'memo', 'agreement', 'contract'],
    builtin: true
  },
  {
    id: 'finance',
    name: 'Finance',
    color: '#7cc576',
    icon: 'Receipt',
    description: 'Invoices, receipts, taxes and bank statements',
    extensions: [],
    keywords: ['invoice', 'receipt', 'tax', 'irs', 'bank', 'statement', 'salary', 'payslip', 'fatura', 'recibo'],
    builtin: true
  },
  {
    id: 'academic',
    name: 'Academic',
    color: '#a78bfa',
    icon: 'GraduationCap',
    description: 'Coursework, theses, lectures and study material',
    extensions: [],
    keywords: ['thesis', 'assignment', 'lecture', 'course', 'exam', 'grade', 'syllabus', 'study', 'university', 'nova', 'ims', 'dissertation', 'paper'],
    builtin: true
  },
  {
    id: 'professional',
    name: 'Professional',
    color: '#f4a64b',
    icon: 'Briefcase',
    description: 'CV, work projects, proposals and meetings',
    extensions: [],
    keywords: ['cv', 'resume', 'curriculum', 'proposal', 'meeting', 'project', 'report', 'client', 'invoice'],
    builtin: true
  },
  {
    id: 'certificates',
    name: 'Certificates',
    color: '#f472b6',
    icon: 'Award',
    description: 'Certifications, diplomas and awards',
    extensions: [],
    keywords: ['certificate', 'certification', 'certificado', 'diploma', 'award', 'credential', 'badge'],
    builtin: true
  },
  {
    id: 'images',
    name: 'Images',
    color: '#34d399',
    icon: 'Image',
    description: 'Pictures and screenshots',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'svg', 'tiff'],
    keywords: ['photo', 'picture', 'screenshot', 'img', 'image'],
    builtin: true
  },
  {
    id: 'media',
    name: 'Media',
    color: '#fb7185',
    icon: 'Film',
    description: 'Audio and video files',
    extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'flac', 'm4a'],
    keywords: ['video', 'audio', 'recording', 'song', 'music'],
    builtin: true
  },
  {
    id: 'spreadsheets',
    name: 'Spreadsheets',
    color: '#22c55e',
    icon: 'Table',
    description: 'Spreadsheets and tabular data',
    extensions: ['xls', 'xlsx', 'csv', 'ods', 'tsv'],
    keywords: ['budget', 'data', 'sheet', 'table', 'expenses'],
    builtin: true
  },
  {
    id: 'presentations',
    name: 'Presentations',
    color: '#fbbf24',
    icon: 'Presentation',
    description: 'Slide decks and presentations',
    extensions: ['ppt', 'pptx', 'key', 'odp'],
    keywords: ['slides', 'deck', 'presentation', 'pitch'],
    builtin: true
  },
  {
    id: 'code',
    name: 'Code',
    color: '#38bdf8',
    icon: 'Code',
    description: 'Source code and config',
    extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json', 'yml', 'yaml', 'sql', 'sh'],
    keywords: ['script', 'code', 'config'],
    builtin: true
  },
  {
    id: 'archives',
    name: 'Archives',
    color: '#94a3b8',
    icon: 'Archive',
    description: 'Compressed archives',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
    keywords: ['archive', 'backup'],
    builtin: true
  },
  {
    id: 'other',
    name: 'Other',
    color: '#64748b',
    icon: 'Box',
    description: 'Anything that does not fit elsewhere',
    extensions: [],
    keywords: [],
    builtin: true
  }
]

/** Built-in expense categories with merchant/keyword hints for auto-sorting. */
export const SEED_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'groceries', name: 'Groceries', color: '#7cc576', icon: 'ShoppingCart', budgetMonthly: 400, keywords: ['grocery', 'supermarket', 'lidl', 'aldi', 'continente', 'pingo doce', 'mercadona', 'auchan', 'tesco', 'walmart', 'market', 'minipreco', 'intermarche'], builtin: true },
  { id: 'dining', name: 'Dining & Coffee', color: '#f4a64b', icon: 'Utensils', budgetMonthly: 200, keywords: ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'burger', 'pizza', 'uber eats', 'glovo', 'bolt food', 'bar', 'bakery', 'padaria', 'restaurante'], builtin: true },
  { id: 'transport', name: 'Transport', color: '#5bb8e6', icon: 'Car', budgetMonthly: 150, keywords: ['uber', 'bolt', 'taxi', 'fuel', 'gas', 'gasolina', 'galp', 'bp', 'metro', 'train', 'comboio', 'cp ', 'bus', 'carris', 'parking', 'parque', 'toll', 'via verde'], builtin: true },
  { id: 'housing', name: 'Housing', color: '#a78bfa', icon: 'Home', budgetMonthly: 800, keywords: ['rent', 'renda', 'mortgage', 'landlord', 'condo', 'condominio', 'apartment'], builtin: true },
  { id: 'utilities', name: 'Utilities', color: '#38bdf8', icon: 'Zap', budgetMonthly: 150, keywords: ['electricity', 'edp', 'endesa', 'water', 'agua', 'gas', 'internet', 'vodafone', 'meo', 'nos', 'phone', 'mobile', 'fibra'], builtin: true },
  { id: 'health', name: 'Health & Fitness', color: '#fb7185', icon: 'HeartPulse', budgetMonthly: 100, keywords: ['pharmacy', 'farmacia', 'doctor', 'clinic', 'clinica', 'hospital', 'dentist', 'dentista', 'gym', 'fitness', 'fitness hut', 'holmes place'], builtin: true },
  { id: 'shopping', name: 'Shopping', color: '#f472b6', icon: 'ShoppingBag', budgetMonthly: 150, keywords: ['amazon', 'zara', 'store', 'shop', 'clothing', 'ikea', 'fnac', 'worten', 'aliexpress', 'h&m', 'decathlon'], builtin: true },
  { id: 'entertainment', name: 'Entertainment', color: '#fbbf24', icon: 'Gamepad2', budgetMonthly: 80, keywords: ['netflix', 'spotify', 'cinema', 'hbo', 'disney', 'youtube', 'game', 'steam', 'prime video', 'twitch', 'playstation'], builtin: true },
  { id: 'subscriptions', name: 'Subscriptions', color: '#c084fc', icon: 'RefreshCw', budgetMonthly: 60, keywords: ['subscription', 'membership', 'icloud', 'google one', 'dropbox', 'adobe', 'microsoft 365', 'openai', 'anthropic'], builtin: true },
  { id: 'education', name: 'Education', color: '#818cf8', icon: 'BookOpen', budgetMonthly: 100, keywords: ['tuition', 'propina', 'course', 'udemy', 'coursera', 'book', 'livro', 'university', 'school', 'escola'], builtin: true },
  { id: 'travel', name: 'Travel', color: '#2dd4bf', icon: 'Plane', budgetMonthly: 0, keywords: ['hotel', 'airbnb', 'flight', 'ryanair', 'tap', 'easyjet', 'booking', 'expedia', 'hostel'], builtin: true },
  { id: 'income', name: 'Income', color: '#22c55e', icon: 'TrendingUp', keywords: ['salary', 'salario', 'payroll', 'ordenado', 'deposit', 'refund', 'reembolso', 'transfer in', 'dividend'], builtin: true },
  { id: 'other-exp', name: 'Other', color: '#64748b', icon: 'CircleDollarSign', keywords: [], builtin: true }
]

export const SEED_REGIONS: WorldRegion[] = [
  { id: 'spawn', name: 'Home Base', color: '#7cc576', description: 'Where every adventure begins', centerX: 0, centerZ: 0 }
]

export function defaultData(): DatabaseShape {
  return {
    files: [],
    fileCategories: SEED_FILE_CATEGORIES.map((c) => ({ ...c })),
    achievements: [],
    goals: [],
    fitnessLogs: [],
    expenses: [],
    expenseCategories: SEED_EXPENSE_CATEGORIES.map((c) => ({ ...c })),
    photos: [],
    photoBlocks: [],
    regions: SEED_REGIONS.map((r) => ({ ...r }))
  }
}
