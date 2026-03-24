import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Typography, 
  Box, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  TablePagination,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  Card,
  Grid,
  Avatar,
  Stack,
  Tabs,
  Tab,
  InputAdornment,
  Divider,
  Fade,
  CircularProgress
} from '@mui/material';
import { 
  Edit, 
  Download, 
  PictureAsPdf, 
  Assessment, 
  PendingActions, 
  CheckCircle, 
  ErrorOutline,
  FilterList,
  Map as MapIcon,
  List as ListIcon,
  Delete,
  Search,
  Refresh,
  LocationOn,
  Logout,
  ImageNotSupported,
  Visibility,
  Close,
  OpenInNew,
  WhatsApp
} from '@mui/icons-material';
import axios from 'axios';
import { format } from 'date-fns';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatErrorMessage } from '../utils/errorUtils';
import { ISSUE_CATEGORIES } from '../constants';
import { normalizeCategory } from '../utils/categoryUtils';

// Fix Leaflet icon issue using CDN URLs
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const statusMap: any = {
  PENDING: { label: 'Pendente', color: 'warning', icon: <PendingActions sx={{ fontSize: 16 }} />, bg: '#fff7ed', text: '#9a3412' },
  IN_PROGRESS: { label: 'Em Execução', color: 'info', icon: <Assessment sx={{ fontSize: 16 }} />, bg: '#f0f9ff', text: '#0369a1' },
  RESOLVED: { label: 'Executado', color: 'success', icon: <CheckCircle sx={{ fontSize: 16 }} />, bg: '#f0fdf4', text: '#15803d' },
  REJECTED: { label: 'Rejeitado', color: 'error', icon: <ErrorOutline sx={{ fontSize: 16 }} />, bg: '#fef2f2', text: '#b91c1c' },
};

const categories = ISSUE_CATEGORIES;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [poles, setPoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingPoles, setLoadingPoles] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [openPoleDialog, setOpenPoleDialog] = useState(false);
  const [openImageModal, setOpenImageModal] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openStatusConfirmDialog, setOpenStatusConfirmDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [comment, setComment] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [statusImage, setStatusImage] = useState<File | null>(null);
  const [manualMessageImage, setManualMessageImage] = useState<File | null>(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [viewTab, setViewTab] = useState(0);
  
  // New Pole State
  const [newPole, setNewPole] = useState({
    id: '',
    address: '',
    neighborhood: '',
    reference: '',
  });
  const [poleImage, setPoleImage] = useState<File | null>(null);
  const [savingPole, setSavingPole] = useState(false);
  
  // WhatsApp Diagnostics
  const [whatsAppLogs, setWhatsAppLogs] = useState<any[]>([]);
  const [whatsAppStatus, setWhatsAppStatus] = useState<any>(null);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('Olá! Esta é uma mensagem de teste do sistema Serrinha Conectada.');
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTestMessage = async () => {
    if (!testNumber) {
      alert('Por favor, insira um número para o teste.');
      return;
    }
    setSendingTest(true);
    try {
      await axios.post('/api/admin/whatsapp/test', {
        number: testNumber,
        message: testMessage
      });
      alert('Mensagem de teste enfileirada com sucesso!');
      fetchWhatsAppDiagnostics();
    } catch (err: any) {
      console.error('Erro ao enviar mensagem de teste', err);
      alert(`Erro: ${err.response?.data?.error || err.message}`);
    } finally {
      setSendingTest(false);
    }
  };
  
  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAddress, setFilterAddress] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [openPoleDeleteConfirm, setOpenPoleDeleteConfirm] = useState(false);
  const [poleToDelete, setPoleToDelete] = useState<string | null>(null);
  const [openRejectConfirm, setOpenRejectConfirm] = useState(false);
  const [requestToReject, setRequestToReject] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const currentUser = useMemo(() => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }, []);

  const fetchIssues = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/issues');
      setIssues(response.data);
    } catch (err: any) {
      console.error('Erro ao buscar relatos', err);
      if (err.response?.status !== 401) {
        alert(formatErrorMessage(err, 'Erro ao buscar relatos'));
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPoles = async () => {
    setLoadingPoles(true);
    try {
      const response = await axios.get('/api/admin/poles');
      setPoles(response.data);
    } catch (err: any) {
      console.error('Erro ao buscar postes', err);
    } finally {
      setLoadingPoles(false);
    }
  };

  const fetchPendingRequests = async () => {
    setLoadingRequests(true);
    try {
      const response = await axios.get('/api/admin/pending-requests');
      setPendingRequests(response.data);
    } catch (err: any) {
      console.error('Erro ao buscar solicitações pendentes', err);
      if (err.response?.status !== 401) {
        alert(formatErrorMessage(err, 'Erro ao buscar solicitações pendentes'));
      }
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchWhatsAppDiagnostics = async () => {
    setLoadingWhatsApp(true);
    try {
      const [logsRes, statusRes] = await Promise.all([
        axios.get('/api/admin/whatsapp/logs'),
        axios.get('/api/admin/whatsapp/status')
      ]);
      setWhatsAppLogs(logsRes.data);
      setWhatsAppStatus(statusRes.data);
    } catch (err: any) {
      console.error('Erro ao buscar diagnósticos do WhatsApp', err);
    } finally {
      setLoadingWhatsApp(false);
    }
  };

  useEffect(() => {
    fetchIssues();
    fetchPendingRequests();
    if (currentUser?.role === 'ADMIN') {
      fetchWhatsAppDiagnostics();
      fetchPoles();
    }
  }, []);

  const handleCreatePole = async () => {
    if (!newPole.id || !newPole.address || !newPole.reference || !poleImage) {
      alert('Preencha todos os campos e anexe uma foto.');
      return;
    }

    setSavingPole(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('id', newPole.id);
      formData.append('address', newPole.address);
      formData.append('neighborhood', newPole.neighborhood);
      formData.append('reference', newPole.reference);
      formData.append('image', poleImage);

      await axios.post('/api/admin/poles', formData, {
        headers: { 
          'Content-Type': 'multipart/form-data'
        }
      });

      setOpenPoleDialog(false);
      setNewPole({ id: '', address: '', neighborhood: '', reference: '' });
      setPoleImage(null);
      fetchPoles();
      alert('Poste cadastrado com sucesso!');
    } catch (err) {
      alert(formatErrorMessage(err, 'Erro ao cadastrar poste'));
    } finally {
      setSavingPole(false);
    }
  };

  const handleDeletePole = (id: string) => {
    setPoleToDelete(id);
    setOpenPoleDeleteConfirm(true);
  };

  const confirmDeletePole = async () => {
    if (!poleToDelete) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/admin/poles/${encodeURIComponent(poleToDelete)}`);
      setOpenPoleDeleteConfirm(false);
      setPoleToDelete(null);
      fetchPoles();
    } catch (err) {
      alert(formatErrorMessage(err, 'Erro ao excluir poste'));
    }
  };

  const handleApproveRequest = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/admin/approve-request/${id}`, {});
      fetchPendingRequests();
      alert('Solicitação aprovada com sucesso!');
    } catch (err) {
      alert(formatErrorMessage(err, 'Erro ao aprovar solicitação'));
    }
  };

  const handleRejectRequest = (id: string) => {
    setRequestToReject(id);
    setOpenRejectConfirm(true);
  };

  const confirmRejectRequest = async () => {
    if (!requestToReject) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/admin/reject-request/${requestToReject}`, {});
      setOpenRejectConfirm(false);
      setRequestToReject(null);
      fetchPendingRequests();
      alert('Solicitação rejeitada com sucesso!');
    } catch (err) {
      alert(formatErrorMessage(err, 'Erro ao rejeitar solicitação'));
    }
  };

  const handleUpdateStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('status', newStatus);
      formData.append('comment', comment);
      
      if (statusImage) {
        formData.append('image', statusImage);
      }

      await axios.post(`/api/admin/issues/${selectedIssue.id}/status`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setOpenStatusConfirmDialog(false);
      setOpenDialog(false);
      setComment('');
      setStatusImage(null);
      fetchIssues();
    } catch (err) {
      console.error('Erro ao atualizar status', err);
      alert(formatErrorMessage(err, 'Erro ao atualizar status'));
    }
  };

  const handleSendManualNotification = async () => {
    if (!manualMessage.trim()) return;
    setSendingNotification(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('message', manualMessage);
      if (manualMessageImage) {
        formData.append('image', manualMessageImage);
      }

      await axios.post(`/api/admin/issues/${selectedIssue.id}/send-notification`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setManualMessage('');
      setManualMessageImage(null);
      alert('Notificação enviada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao enviar notificação', err);
      const errorMsg = err.response?.data?.error || err.message;
      alert(`Erro ao enviar notificação: ${errorMsg}`);
    } finally {
      setSendingNotification(false);
    }
  };

  const handleDeleteIssue = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/admin/issues/${selectedIssue.id}`);
      setOpenDeleteDialog(false);
      fetchIssues();
    } catch (err) {
      console.error('Erro ao excluir relato', err);
      alert(formatErrorMessage(err, 'Erro ao excluir relato'));
    }
  };

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      const matchesStatus = !filterStatus || issue.status === filterStatus;
      
      const matchesCategory = !filterCategory || normalizeCategory(issue.category) === filterCategory;
      const matchesAddress = !filterAddress || 
        (issue.address && issue.address.toLowerCase().includes(filterAddress.toLowerCase()));
      const matchesSearch = !searchTerm || 
        issue.protocol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.address?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesStatus && matchesCategory && matchesAddress && matchesSearch;
    });
  }, [issues, filterStatus, filterCategory, filterAddress, searchTerm]);

  const paginatedIssues = useMemo(() => {
    return filteredIssues.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [filteredIssues, page, rowsPerPage]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filterStatus, filterCategory, filterAddress, searchTerm]);

  const stats = {
    total: issues.length,
    pending: issues.filter(i => i.status === 'PENDING').length,
    inProgress: issues.filter(i => i.status === 'IN_PROGRESS').length,
    resolved: issues.filter(i => i.status === 'RESOLVED').length,
  };

  const exportToExcel = async (statusFilter?: string) => {
    const dataToExport = statusFilter ? issues.filter(i => i.status === statusFilter) : filteredIssues;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatos');
    
    worksheet.columns = [
      { header: 'Protocolo', key: 'protocol', width: 25 },
      { header: 'Categoria', key: 'category', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Data', key: 'date', width: 20 },
      { header: 'Endereço', key: 'address', width: 40 },
      { header: 'WhatsApp', key: 'whatsapp', width: 20 },
      { header: 'Descrição', key: 'description', width: 50 },
    ];

    dataToExport.forEach(issue => {
      worksheet.addRow({
        protocol: issue.protocol,
        category: issue.category,
        status: statusMap[issue.status].label,
        date: format(new Date(issue.createdAt), 'dd/MM/yyyy HH:mm'),
        address: issue.address || 'N/A',
        whatsapp: issue.whatsapp || 'N/A',
        description: issue.description,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatos-prefeitura-serrinha-${statusFilter || 'geral'}-${format(new Date(), 'yyyyMMdd')}.xlsx`;
    anchor.click();
  };

  const exportToPDF = (statusFilter?: string) => {
    const dataToExport = statusFilter ? issues.filter(i => i.status === statusFilter) : filteredIssues;
    const doc = new jsPDF() as any;
    doc.setFontSize(18);
    doc.text('Relatório de Zeladoria Urbana - Prefeitura de Serrinha - Cidadão ativo!', 14, 20);
    doc.setFontSize(12);
    doc.text(`Filtro: ${statusFilter ? statusMap[statusFilter].label : 'Geral'}`, 14, 30);
    doc.text(`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 37);
    
    const tableData = dataToExport.map(issue => [
      issue.protocol,
      issue.category,
      statusMap[issue.status].label,
      format(new Date(issue.createdAt), 'dd/MM/yyyy'),
      issue.address || 'N/A',
      issue.whatsapp || 'N/A'
    ]);

    autoTable(doc, {
      head: [['Protocolo', 'Categoria', 'Status', 'Data', 'Endereço', 'WhatsApp']],
      body: tableData,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [0, 74, 141] }
    });

    doc.save(`relatos-prefeitura-serrinha-${statusFilter || 'geral'}-${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <Box sx={{ py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2, mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-1.5px', color: 'primary.main' }}>Painel de Gestão</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>Monitoramento e controle de solicitações urbanas.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button 
            variant="contained" 
            startIcon={<Refresh />} 
            onClick={fetchIssues}
            disabled={loading}
            sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 700, px: 3 }}
          >
            Atualizar
          </Button>
          <Button 
            variant="outlined" 
            color="error"
            startIcon={<Logout />} 
            onClick={handleLogout}
            sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 700, px: 3 }}
          >
            Sair
          </Button>
          <Tooltip title="Exportar Relatório Geral">
            <IconButton onClick={() => exportToExcel()} sx={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 3 }}>
              <Download />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          { label: 'Total de Relatos', value: stats.total, color: '#1e293b', icon: <Assessment />, status: null },
          { label: 'Pendentes', value: stats.pending, color: '#9a3412', icon: <PendingActions />, status: 'PENDING' },
          { label: 'Em Execução', value: stats.inProgress, color: '#0369a1', icon: <Assessment />, status: 'IN_PROGRESS' },
          { label: 'Executados', value: stats.resolved, color: '#15803d', icon: <CheckCircle />, status: 'RESOLVED' },
        ].map((stat, i) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            <Card sx={{ 
              p: 3, 
              borderRadius: 5, 
              border: '1px solid rgba(0,0,0,0.05)', 
              boxShadow: '0 10px 30px rgba(0,0,0,0.02)',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'translateY(-4px)' }
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '1px' }}>{stat.label}</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 900, mt: 0.5, color: stat.color }}>{stat.value}</Typography>
                </Box>
                <Avatar sx={{ bgcolor: `${stat.color}15`, color: stat.color, borderRadius: 3, width: 48, height: 48 }}>
                  {stat.icon}
                </Avatar>
              </Box>
              {stat.status && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 1 }}>
                  <Button size="small" onClick={() => exportToExcel(stat.status!)} sx={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'none' }}>Excel</Button>
                  <Button size="small" onClick={() => exportToPDF(stat.status!)} sx={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'none' }}>PDF</Button>
                </Box>
              )}
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters Bar */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 5, border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              placeholder="Buscar por protocolo ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search color="action" />
                  </InputAdornment>
                ),
                sx: { borderRadius: 3 }
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2.5 }}>
            <TextField
              select
              fullWidth
              label="Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            >
              <MenuItem value="">Todos os Status</MenuItem>
              {Object.keys(statusMap).map((key) => (
                <MenuItem key={key} value={key}>{statusMap[key].label}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2.5 }}>
            <TextField
              select
              fullWidth
              label="Categoria"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            >
              <MenuItem value="">Todas as Categorias</MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2 }}>
            <TextField
              fullWidth
              label="Endereço"
              placeholder="Filtrar por rua, bairro..."
              value={filterAddress}
              onChange={(e) => setFilterAddress(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2 }}>
            <Button 
              fullWidth 
              variant="outlined" 
              onClick={() => {
                setSearchTerm('');
                setFilterStatus('');
                setFilterCategory('');
                setFilterAddress('');
              }}
              sx={{ borderRadius: 3, height: 56, textTransform: 'none', fontWeight: 700 }}
            >
              Limpar Filtros
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* View Switcher */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Tabs 
          value={viewTab} 
          onChange={(_, v) => setViewTab(v)} 
          sx={{ 
            bgcolor: 'rgba(0,0,0,0.03)', 
            borderRadius: 4, 
            p: 0.5,
            '& .MuiTabs-indicator': { height: '100%', borderRadius: 3.5, zIndex: 0, bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
            '& .MuiTab-root': { zIndex: 1, textTransform: 'none', fontWeight: 700, minHeight: 44, borderRadius: 3.5, px: 4 }
          }}
        >
          <Tab icon={<ListIcon sx={{ mr: 1 }} />} iconPosition="start" label="Lista" />
          <Tab icon={<MapIcon sx={{ mr: 1 }} />} iconPosition="start" label="Mapa" />
          {currentUser?.role === 'ADMIN' && (
            <Tab icon={<LocationOn sx={{ mr: 1 }} />} iconPosition="start" label="Postes" />
          )}
          {currentUser?.role === 'ADMIN' && (
            <Tab icon={<WhatsApp sx={{ mr: 1 }} />} iconPosition="start" label="WhatsApp" />
          )}
          <Tab 
            icon={<PendingActions sx={{ mr: 1 }} />} 
            iconPosition="start" 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                Solicitações
                {pendingRequests.length > 0 && (
                  <Chip 
                    label={pendingRequests.length} 
                    size="small" 
                    color="error" 
                    sx={{ ml: 1, height: 20, minWidth: 20, fontSize: '0.65rem', fontWeight: 900 }} 
                  />
                )}
              </Box>
            } 
          />
        </Tabs>
      </Box>

      {/* Content Area */}
      <Fade in={!loading}>
        <Box>
          {viewTab === 0 ? (
            <Paper sx={{ borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.03)' }}>
              <TableContainer>
                <Table>
                  <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.01)' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800, color: 'text.secondary' }}>FOTO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.secondary' }}>PROTOCOLO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.secondary' }}>CATEGORIA</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.secondary' }}>DATA</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.secondary' }}>ENDEREÇO</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.secondary' }}>WHATSAPP</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.secondary' }}>STATUS</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: 'text.secondary' }}>AÇÕES</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                      {paginatedIssues.map((issue) => (
                        <TableRow key={issue.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                          <TableCell>
                            {issue.imageUrl ? (
                              <Box 
                                onClick={() => {
                                  setSelectedIssue(issue);
                                  setOpenImageModal(true);
                                }}
                                sx={{ 
                                  width: 60, 
                                  height: 60, 
                                  borderRadius: 2, 
                                  overflow: 'hidden', 
                                  cursor: 'pointer',
                                  border: '2px solid rgba(0,0,0,0.05)',
                                  position: 'relative',
                                  '&:hover': { 
                                    transform: 'scale(1.05)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    '& .zoom-overlay': { opacity: 1 }
                                  },
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                <img 
                                  src={issue.imageUrl} 
                                  alt="Thumbnail" 
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  referrerPolicy="no-referrer"
                                  onError={(e: any) => {
                                    e.target.src = 'https://placehold.co/100x100?text=Erro';
                                  }}
                                />
                                <Box 
                                  className="zoom-overlay"
                                  sx={{ 
                                    position: 'absolute', 
                                    top: 0, 
                                    left: 0, 
                                    right: 0, 
                                    bottom: 0, 
                                    bgcolor: 'rgba(0,0,0,0.2)', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    opacity: 0,
                                    transition: 'opacity 0.2s ease'
                                  }}
                                >
                                  <Visibility sx={{ color: 'white', fontSize: 20 }} />
                                </Box>
                              </Box>
                            ) : (
                              <Box sx={{ width: 60, height: 60, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(0,0,0,0.1)' }}>
                                <ImageNotSupported sx={{ fontSize: 24, color: 'text.disabled' }} />
                              </Box>
                            )}
                          </TableCell>
                          <TableCell 
                            sx={{ 
                              fontWeight: 800, 
                              color: 'primary.main', 
                              cursor: 'pointer',
                              '&:hover': { textDecoration: 'underline' }
                            }}
                            onClick={() => {
                              setSelectedIssue(issue);
                              setNewStatus(issue.status);
                              setOpenDialog(true);
                            }}
                          >
                            {issue.protocol}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{normalizeCategory(issue.category)}</TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{format(new Date(issue.createdAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell sx={{ maxWidth: 250 }}>
                          <Typography variant="body2" noWrap title={issue.address}>
                            {issue.address || 'Localização no mapa'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {issue.whatsapp ? (
                            <Tooltip title="Abrir conversa no WhatsApp">
                              <Chip 
                                icon={<WhatsApp sx={{ fontSize: '14px !important' }} />}
                                label={issue.whatsapp}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`https://wa.me/${issue.whatsapp.replace(/\D/g, '')}`, '_blank');
                                }}
                                size="small"
                                sx={{ 
                                  cursor: 'pointer', 
                                  fontWeight: 600,
                                  '&:hover': { bgcolor: 'success.light', color: 'white' }
                                }}
                              />
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="text.disabled">Não informado</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={statusMap[issue.status].label} 
                            sx={{ 
                              fontWeight: 800, 
                              borderRadius: 2, 
                              bgcolor: statusMap[issue.status].bg, 
                              color: statusMap[issue.status].text,
                              fontSize: '0.75rem'
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Tooltip title="Atualizar Status">
                              <IconButton 
                                size="small"
                                onClick={() => {
                                  setSelectedIssue(issue);
                                  setNewStatus(issue.status);
                                  setOpenDialog(true);
                                }}
                                sx={{ bgcolor: 'rgba(0,74,141,0.05)', color: 'primary.main', '&:hover': { bgcolor: 'primary.main', color: 'white' } }}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {currentUser?.role === 'ADMIN' && (
                              <Tooltip title="Excluir Relato">
                                <IconButton 
                                  size="small"
                                  onClick={() => {
                                    setSelectedIssue(issue);
                                    setOpenDeleteDialog(true);
                                  }}
                                  sx={{ bgcolor: 'rgba(239,68,68,0.05)', color: 'error.main', '&:hover': { bgcolor: 'error.main', color: 'white' } }}
                                >
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[5, 10, 15, 25]}
                component="div"
                count={filteredIssues.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                labelRowsPerPage="Itens por página:"
                labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
                sx={{ borderTop: '1px solid rgba(0,0,0,0.05)', fontWeight: 600 }}
              />
              {filteredIssues.length === 0 && (
                <Box sx={{ py: 10, textAlign: 'center' }}>
                  <Avatar sx={{ mx: 'auto', mb: 2, bgcolor: 'rgba(0,0,0,0.05)', color: 'text.disabled', width: 64, height: 64 }}>
                    <Search fontSize="large" />
                  </Avatar>
                  <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 700 }}>Nenhum relato encontrado</Typography>
                  <Typography variant="body2" color="text.disabled">Tente ajustar seus filtros de busca.</Typography>
                </Box>
              )}
            </Paper>
          ) : viewTab === 1 ? (
            <Paper sx={{ borderRadius: 5, overflow: 'hidden', height: '600px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.03)' }}>
              <MapContainer center={[-11.66, -38.96]} zoom={14} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {filteredIssues.map((issue) => (
                  <Marker key={issue.id} position={[issue.latitude, issue.longitude]}>
                    <Popup>
                      <Box sx={{ p: 1, minWidth: 250, maxWidth: 300 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', mb: 0.5 }}>{issue.protocol}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Chip 
                            label={statusMap[issue.status].label} 
                            size="small"
                            sx={{ fontWeight: 700, bgcolor: statusMap[issue.status].bg, color: statusMap[issue.status].text, height: 20, fontSize: '0.65rem' }}
                          />
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>{issue.category}</Typography>
                        </Box>
                        
                        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', display: 'block', mb: 0.5 }}>Descrição:</Typography>
                        <Typography variant="body2" sx={{ mb: 1.5, fontSize: '0.75rem', lineHeight: 1.4, color: 'text.primary' }}>
                          {issue.description}
                        </Typography>

                        <Divider sx={{ my: 1 }} />
                        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', display: 'block', mb: 1 }}>Histórico de Status:</Typography>
                        <Box sx={{ maxHeight: 120, overflowY: 'auto', pr: 0.5, mb: 1.5, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.1)', borderRadius: '4px' } }}>
                          <Stack spacing={0}>
                            {/* Subsequent History (Newest first) */}
                            {issue.history && issue.history.map((h: any, idx: number) => (
                              <Box key={idx} sx={{ pl: 1.5, pb: 1, borderLeft: '2px solid', borderColor: statusMap[h.status]?.text || 'divider', position: 'relative' }}>
                                <Box sx={{ 
                                  position: 'absolute', 
                                  left: -5, 
                                  top: 0, 
                                  width: 8, 
                                  height: 8, 
                                  borderRadius: '50%', 
                                  bgcolor: statusMap[h.status]?.text || 'divider',
                                  border: '2px solid white'
                                }} />
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', fontSize: '0.65rem', lineHeight: 1 }}>
                                  {statusMap[h.status]?.label}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', fontSize: '0.6rem', mb: 0.5 }}>
                                  {format(new Date(h.createdAt), 'dd/MM/yyyy HH:mm')}
                                </Typography>
                                {h.comment && (
                                  <Typography variant="caption" sx={{ 
                                    display: 'block', 
                                    color: 'text.secondary', 
                                    fontStyle: 'italic', 
                                    fontSize: '0.65rem', 
                                    lineHeight: 1.2,
                                    bgcolor: 'rgba(0,0,0,0.03)',
                                    p: 0.5,
                                    borderRadius: 1
                                  }}>
                                    "{h.comment}"
                                  </Typography>
                                )}
                              </Box>
                            ))}

                            {/* Initial Creation (Always at the bottom of the stack since history is desc) */}
                            <Box sx={{ pl: 1.5, pb: 0, borderLeft: '2px solid transparent', position: 'relative' }}>
                              <Box sx={{ 
                                position: 'absolute', 
                                left: -5, 
                                top: 0, 
                                width: 8, 
                                height: 8, 
                                borderRadius: '50%', 
                                bgcolor: 'text.disabled',
                                border: '2px solid white'
                              }} />
                              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', fontSize: '0.65rem', lineHeight: 1, color: 'text.secondary' }}>
                                Relato Registrado
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', fontSize: '0.6rem' }}>
                                {format(new Date(issue.createdAt), 'dd/MM/yyyy HH:mm')}
                              </Typography>
                            </Box>
                          </Stack>
                        </Box>

                        <Divider sx={{ my: 1 }} />
                        <Button 
                          fullWidth 
                          size="small" 
                          variant="contained" 
                          onClick={() => {
                            setSelectedIssue(issue);
                            setNewStatus(issue.status);
                            setOpenDialog(true);
                          }}
                          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, fontSize: '0.7rem' }}
                        >
                          Gerenciar Solicitação
                        </Button>
                      </Box>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </Paper>
          ) : viewTab === 2 && currentUser?.role === 'ADMIN' ? (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Gestão de Postes (QR Codes)</Typography>
                <Button 
                  variant="contained" 
                  startIcon={<LocationOn />} 
                  onClick={() => setOpenPoleDialog(true)}
                  sx={{ borderRadius: 3, fontWeight: 700 }}
                >
                  Cadastrar Novo Poste
                </Button>
              </Box>

              <Paper sx={{ borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.03)' }}>
                <TableContainer>
                  <Table>
                    <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.01)' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800 }}>FOTO</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>ID DO POSTE</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>ENDEREÇO</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>BAIRRO</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>REFERÊNCIA</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>LINK QR CODE</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>AÇÕES</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {poles.map((pole) => (
                        <TableRow key={pole.id} hover>
                          <TableCell>
                            <Avatar 
                              src={pole.imageUrl} 
                              variant="rounded" 
                              sx={{ width: 60, height: 60, border: '1px solid rgba(0,0,0,0.05)' }}
                            >
                              <LocationOn />
                            </Avatar>
                          </TableCell>
                          <TableCell sx={{ fontWeight: 800, color: 'primary.main' }}>{pole.id}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{pole.address}</TableCell>
                          <TableCell>{pole.neighborhood || '-'}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{pole.reference}</TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.05)', p: 0.5, borderRadius: 1 }}>
                              {`${window.location.origin}/?p=${pole.id}`}
                            </Typography>
                            <IconButton size="small" onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/?p=${pole.id}`);
                              alert('Link copiado!');
                            }}>
                              <Visibility sx={{ fontSize: 16 }} />
                            </IconButton>
                          </TableCell>
                          <TableCell align="right">
                            <IconButton color="error" onClick={() => handleDeletePole(pole.id)}>
                              <Delete />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {poles.length === 0 && !loadingPoles && (
                  <Box sx={{ py: 10, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">Nenhum poste cadastrado</Typography>
                    <Button sx={{ mt: 2 }} onClick={() => setOpenPoleDialog(true)}>Cadastrar Primeiro Poste</Button>
                  </Box>
                )}
                {loadingPoles && (
                  <Box sx={{ py: 10, textAlign: 'center' }}>
                    <CircularProgress />
                  </Box>
                )}
              </Paper>
            </Box>
          ) : viewTab === 3 && currentUser?.role === 'ADMIN' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Paper sx={{ p: 3, borderRadius: 5, border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.03)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WhatsApp color="success" /> Status do Serviço WhatsApp
                  </Typography>
                  <Button startIcon={<Refresh />} onClick={fetchWhatsAppDiagnostics} disabled={loadingWhatsApp}>
                    Atualizar Status
                  </Button>
                </Box>

                <Paper sx={{ p: 3, mb: 4, borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WhatsApp color="primary" /> Enviar Mensagem de Teste
                  </Typography>
                  <Grid container spacing={2} alignItems="flex-end">
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Número (com DDD)"
                        placeholder="75999999999"
                        value={testNumber}
                        onChange={(e) => setTestNumber(e.target.value.replace(/\D/g, ''))}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Mensagem"
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 2 }}>
                      <Button 
                        fullWidth 
                        variant="contained" 
                        onClick={handleSendTestMessage}
                        disabled={sendingTest || !testNumber}
                      >
                        {sendingTest ? <CircularProgress size={24} /> : 'Testar'}
                      </Button>
                    </Grid>
                  </Grid>
                </Paper>

                {whatsAppStatus ? (
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 12 }}>
                      <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>Configuração da API (Evolution)</Typography>
                        <Stack spacing={1}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">URL da API:</Typography>
                            <Chip label={whatsAppStatus.config.apiUrl} size="small" color={whatsAppStatus.config.apiUrl === 'Configurado' ? 'success' : 'error'} />
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">Chave da API:</Typography>
                            <Chip label={whatsAppStatus.config.apiKey} size="small" color={whatsAppStatus.config.apiKey === 'Configurado' ? 'success' : 'error'} />
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">Instância:</Typography>
                            <Chip label={whatsAppStatus.config.instance} size="small" color={whatsAppStatus.config.instance === 'Configurado' ? 'success' : 'error'} />
                          </Box>
                        </Stack>
                      </Card>
                    </Grid>
                  </Grid>
                ) : (
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                  </Box>
                )}
              </Paper>

              <Paper sx={{ borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.03)' }}>
                <Box sx={{ p: 3, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>Logs Recentes de Envio</Typography>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.01)' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>DATA</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>NÚMERO</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>STATUS</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>TENTATIVAS</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>ERRO</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {whatsAppLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell sx={{ fontSize: '0.75rem' }}>{format(new Date(log.createdAt), 'dd/MM HH:mm:ss')}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem' }}>{log.phoneNumber}</TableCell>
                          <TableCell>
                            <Chip 
                              label={log.status} 
                              size="small" 
                              color={log.status === 'sent' ? 'success' : log.status === 'failed' ? 'error' : 'warning'}
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.75rem' }}>{log.attempts}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', color: 'error.main', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.lastError || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {whatsAppLogs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 4 }}>Nenhum log encontrado.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          ) : viewTab === 4 ? (
            <Paper sx={{ p: 4, borderRadius: 5, border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.03)' }}>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <PendingActions color="primary" /> Solicitações de Acesso Pendentes
              </Typography>
              
              {loadingRequests ? (
                <Box sx={{ py: 10, textAlign: 'center' }}>
                  <CircularProgress />
                </Box>
              ) : pendingRequests.length === 0 ? (
                <Box sx={{ py: 8, textAlign: 'center', bgcolor: 'rgba(0,0,0,0.01)', borderRadius: 4, border: '1px dashed rgba(0,0,0,0.1)' }}>
                  <CheckCircle sx={{ fontSize: 48, color: 'success.light', mb: 2, opacity: 0.5 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.secondary' }}>Tudo em dia!</Typography>
                  <Typography variant="body2" color="text.disabled">Não há novas solicitações de administrador aguardando aprovação.</Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800 }}>NOME</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>E-MAIL</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>DATA DO PEDIDO</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>AÇÕES</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pendingRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell sx={{ fontWeight: 700 }}>{request.name}</TableCell>
                          <TableCell>{request.email}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>
                            {format(new Date(request.createdAt), 'dd/MM/yyyy HH:mm')}
                            <Typography variant="caption" display="block" color="error">
                              Expira em {15 - Math.floor((new Date().getTime() - new Date(request.createdAt).getTime()) / (1000 * 60 * 60 * 24))} dias
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button 
                                variant="contained" 
                                color="success" 
                                size="small"
                                onClick={() => handleApproveRequest(request.id)}
                                sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none' }}
                              >
                                Aprovar
                              </Button>
                              <Button 
                                variant="outlined" 
                                color="error" 
                                size="small"
                                onClick={() => handleRejectRequest(request.id)}
                                sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none' }}
                              >
                                Rejeitar
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          ) : null}
        </Box>
      </Fade>

      {/* Update Dialog */}
      <Dialog 
        open={openDialog} 
        onClose={() => setOpenDialog(false)} 
        fullWidth 
        maxWidth="sm"
        PaperProps={{ 
          sx: { 
            borderRadius: 6, 
            p: 1,
            backgroundImage: 'linear-gradient(to bottom, #ffffff, #f9fafb)'
          } 
        }}
      >
        <DialogTitle sx={{ 
          fontWeight: 900, 
          fontSize: '1.5rem', 
          letterSpacing: '-1px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          Detalhes da Solicitação
          <IconButton onClick={() => setOpenDialog(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>PROTOCOLO</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 800, color: 'primary.main', fontFamily: 'monospace' }}>{selectedIssue?.protocol}</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>CATEGORIA</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 800 }}>{selectedIssue?.category}</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>STATUS ATUAL</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusMap[selectedIssue?.status]?.text }} />
                    <Typography variant="body1" sx={{ fontWeight: 800, color: statusMap[selectedIssue?.status]?.text }}>
                      {statusMap[selectedIssue?.status]?.label}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            </Grid>

            {selectedIssue?.imageUrl && (
              <Box sx={{ position: 'relative' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', mb: 1, display: 'block' }}>EVIDÊNCIA FOTOGRÁFICA</Typography>
                <Box 
                  onClick={() => setOpenImageModal(true)}
                  sx={{ 
                    width: '100%', 
                    borderRadius: 4, 
                    overflow: 'hidden', 
                    border: '2px solid rgba(0,0,0,0.05)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'transform 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.01)',
                      '& .overlay': { opacity: 1 }
                    }
                  }}
                >
                  <img 
                    src={selectedIssue.imageUrl} 
                    alt="Evidência" 
                    style={{ width: '100%', height: 'auto', maxHeight: 350, objectFit: 'cover', display: 'block' }} 
                    referrerPolicy="no-referrer"
                    onError={(e: any) => {
                      e.target.src = 'https://placehold.co/600x400?text=Imagem+nao+encontrada';
                    }}
                  />
                  <Box className="overlay" sx={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    bgcolor: 'rgba(0,0,0,0.3)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.2s ease'
                  }}>
                    <Box sx={{ bgcolor: 'white', px: 2, py: 1, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Visibility fontSize="small" />
                      <Typography variant="button" sx={{ fontWeight: 700 }}>Ampliar Foto</Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}

            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase' }}>DESCRIÇÃO</Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 500, lineHeight: 1.6 }}>{selectedIssue?.description}</Typography>
            </Box>

            {selectedIssue?.poleId && (
              <Box sx={{ p: 2, bgcolor: 'rgba(0,74,141,0.03)', borderRadius: 3, border: '1px solid rgba(0,74,141,0.1)' }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationOn sx={{ fontSize: 16 }} /> INFORMAÇÕES DO POSTE (QR CODE)
                </Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>ID: {selectedIssue.poleId}</Typography>
                    <Typography variant="body2">Endereço: {selectedIssue.poleAddress}</Typography>
                    <Typography variant="body2">Ref: {selectedIssue.poleReference}</Typography>
                    <Typography variant="caption" color={selectedIssue.isNearPole ? "success.main" : "error.main"} sx={{ fontWeight: 800, mt: 1, display: 'block' }}>
                      {selectedIssue.isNearPole ? "✓ Cidadão confirmou estar próximo a este poste" : "✗ Cidadão informou NÃO estar próximo a este poste"}
                    </Typography>
                  </Grid>
                  {selectedIssue.poleImageUrl && (
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <img 
                        src={selectedIssue.poleImageUrl} 
                        alt="Foto do Poste" 
                        style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)' }} 
                        referrerPolicy="no-referrer"
                      />
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}

            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase' }}>LOCALIZAÇÃO</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <LocationOn color="primary" fontSize="small" />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectedIssue?.address || 'Ver no mapa'}</Typography>
              </Box>
              <Button 
                variant="text" 
                size="small" 
                startIcon={<OpenInNew />}
                sx={{ mt: 1, fontWeight: 700, textTransform: 'none' }}
                onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${selectedIssue.latitude},${selectedIssue.longitude}`, '_blank')}
              >
                Abrir no Google Maps
              </Button>
            </Box>

            <Divider />

            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Ações de Gestão</Typography>

            <TextField
              select
              fullWidth
              label="Novo Status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            >
              {Object.keys(statusMap).map((key) => (
                <MenuItem key={key} value={key}>{statusMap[key].label}</MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              label="Comentário para o Cidadão"
              multiline
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Descreva o andamento ou motivo da resolução..."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            />

            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', mb: 1, display: 'block' }}>
                ANEXAR FOTO À NOTIFICAÇÃO (OPCIONAL)
              </Typography>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                disabled={!selectedIssue?.whatsapp}
                sx={{ borderRadius: 3, py: 1.5, textTransform: 'none', fontWeight: 700, bgcolor: 'white' }}
              >
                {statusImage ? `Foto: ${statusImage.name}` : 'Selecionar Foto para WhatsApp'}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => setStatusImage(e.target.files?.[0] || null)}
                />
              </Button>
              {!selectedIssue?.whatsapp && (
                <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block', fontWeight: 600 }}>
                  Opção desativada: Cidadão não forneceu número de WhatsApp.
                </Typography>
              )}
            </Box>

            <Divider sx={{ my: 1 }} />
            
            <Box sx={{ p: 2, bgcolor: 'rgba(16,185,129,0.03)', borderRadius: 3, border: '1px solid rgba(16,185,129,0.1)' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'success.main', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <WhatsApp sx={{ fontSize: 20 }} /> Enviar Mensagem Direta (WhatsApp)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Use este campo para enviar uma mensagem personalizada ao cidadão via WhatsApp. O número cadastrado é: <strong>{selectedIssue?.whatsapp || 'Não fornecido'}</strong>
              </Typography>
              
              {selectedIssue?.whatsapp && (
                <Button
                  variant="text"
                  size="small"
                  startIcon={<OpenInNew />}
                  onClick={() => window.open(`https://wa.me/${selectedIssue.whatsapp.replace(/\D/g, '')}`, '_blank')}
                  sx={{ mb: 2, fontWeight: 700, textTransform: 'none', color: 'success.main' }}
                >
                  Abrir conversa direta no WhatsApp Web
                </Button>
              )}
              <TextField
                fullWidth
                label="Mensagem Personalizada"
                multiline
                rows={3}
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                placeholder="Escreva aqui sua mensagem direta..."
                disabled={!selectedIssue?.whatsapp}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: 'white' }, mb: 2 }}
              />
              <Box sx={{ mb: 2 }}>
                <Button
                  variant="outlined"
                  component="label"
                  fullWidth
                  disabled={!selectedIssue?.whatsapp}
                  sx={{ borderRadius: 3, py: 1.5, textTransform: 'none', fontWeight: 700, bgcolor: 'white' }}
                >
                  {manualMessageImage ? `Foto: ${manualMessageImage.name}` : 'Anexar Foto à Mensagem'}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e) => setManualMessageImage(e.target.files?.[0] || null)}
                  />
                </Button>
              </Box>
              <Button 
                variant="outlined" 
                color="success" 
                fullWidth
                onClick={handleSendManualNotification}
                disabled={sendingNotification || !manualMessage.trim() || !selectedIssue?.whatsapp}
                sx={{ borderRadius: 3, fontWeight: 700, textTransform: 'none' }}
              >
                {sendingNotification ? <CircularProgress size={20} /> : 'Enviar WhatsApp Agora'}
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 4 }}>
          <Button onClick={() => setOpenDialog(false)} sx={{ fontWeight: 800, color: 'text.secondary' }}>Fechar</Button>
          <Button 
            variant="contained" 
            onClick={() => setOpenStatusConfirmDialog(true)}
            sx={{ borderRadius: 3, px: 4, py: 1.2, fontWeight: 800, boxShadow: '0 8px 20px rgba(0,74,141,0.2)' }}
          >
            Salvar Alteração
          </Button>
        </DialogActions>
      </Dialog>

      {/* Image Lightbox */}
      <Dialog 
        open={openImageModal} 
        onClose={() => setOpenImageModal(false)} 
        maxWidth="lg"
        PaperProps={{ sx: { bgcolor: 'transparent', boxShadow: 'none', overflow: 'hidden' } }}
      >
        <Box sx={{ position: 'relative' }}>
          <IconButton 
            onClick={() => setOpenImageModal(false)}
            sx={{ position: 'absolute', top: 10, right: 10, bgcolor: 'rgba(255,255,255,0.8)', '&:hover': { bgcolor: 'white' }, zIndex: 10 }}
          >
            <Close />
          </IconButton>
          <img 
            src={selectedIssue?.imageUrl} 
            alt="Evidência Full" 
            style={{ maxWidth: '100%', maxHeight: '90vh', display: 'block', borderRadius: 16 }} 
            referrerPolicy="no-referrer"
            onError={(e: any) => {
              e.target.src = 'https://placehold.co/800x600?text=Erro+ao+carregar+imagem';
            }}
          />
        </Box>
      </Dialog>

      {/* Status Update Confirmation */}
      <Dialog 
        open={openStatusConfirmDialog} 
        onClose={() => setOpenStatusConfirmDialog(false)}
        PaperProps={{ sx: { borderRadius: 5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: 'primary.main' }}>Confirmar Alteração de Status</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontWeight: 500, mb: 2 }}>
            Você está prestes a alterar o status do relato <strong>{selectedIssue?.protocol}</strong> para <strong>{statusMap[newStatus]?.label}</strong>.
          </Typography>
          {comment && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 2, border: '1px solid rgba(0,0,0,0.05)' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block' }}>COMENTÁRIO:</Typography>
              <Typography variant="body2">"{comment}"</Typography>
            </Box>
          )}
          <Typography sx={{ mt: 2, fontWeight: 500 }}>Deseja prosseguir com esta alteração?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenStatusConfirmDialog(false)} sx={{ fontWeight: 700 }}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleUpdateStatus}
            sx={{ borderRadius: 2, fontWeight: 800 }}
          >
            Confirmar Alteração
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog 
        open={openDeleteDialog} 
        onClose={() => setOpenDeleteDialog(false)}
        PaperProps={{ sx: { borderRadius: 5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: 'error.main' }}>Confirmar Exclusão</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontWeight: 500 }}>
            Tem certeza que deseja excluir permanentemente o relato <strong>{selectedIssue?.protocol}</strong>? 
            Esta ação não pode ser desfeita e removerá todos os registros históricos associados.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenDeleteDialog(false)} sx={{ fontWeight: 700 }}>Cancelar</Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleDeleteIssue}
            sx={{ borderRadius: 2, fontWeight: 800 }}
          >
            Sim, Excluir
          </Button>
        </DialogActions>
      </Dialog>

      {/* Pole Delete Confirmation */}
      <Dialog 
        open={openPoleDeleteConfirm} 
        onClose={() => setOpenPoleDeleteConfirm(false)}
        PaperProps={{ sx: { borderRadius: 5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: 'error.main' }}>Confirmar Exclusão de Poste</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontWeight: 500 }}>
            Tem certeza que deseja excluir permanentemente o poste <strong>{poleToDelete}</strong>? 
            Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenPoleDeleteConfirm(false)} sx={{ fontWeight: 700 }}>Cancelar</Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={confirmDeletePole}
            sx={{ borderRadius: 2, fontWeight: 800 }}
          >
            Sim, Excluir
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Request Confirmation */}
      <Dialog 
        open={openRejectConfirm} 
        onClose={() => setOpenRejectConfirm(false)}
        PaperProps={{ sx: { borderRadius: 5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: 'error.main' }}>Confirmar Rejeição</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontWeight: 500 }}>
            Tem certeza que deseja rejeitar esta solicitação de acesso administrativo?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenRejectConfirm(false)} sx={{ fontWeight: 700 }}>Cancelar</Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={confirmRejectRequest}
            sx={{ borderRadius: 2, fontWeight: 800 }}
          >
            Sim, Rejeitar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Pole Registration Dialog */}
      <Dialog 
        open={openPoleDialog} 
        onClose={() => setOpenPoleDialog(false)}
        PaperProps={{ sx: { borderRadius: 5, p: 1, minWidth: 400 } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: 'primary.main' }}>Cadastrar Novo Poste</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="ID do Poste (Ex: 10, 101, A1)"
              value={newPole.id}
              onChange={(e) => setNewPole({ ...newPole, id: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            />
            <TextField
              fullWidth
              label="Endereço"
              value={newPole.address}
              onChange={(e) => setNewPole({ ...newPole, address: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            />
            <TextField
              fullWidth
              label="Bairro"
              value={newPole.neighborhood}
              onChange={(e) => setNewPole({ ...newPole, neighborhood: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            />
            <TextField
              fullWidth
              label="Ponto de Referência"
              value={newPole.reference}
              onChange={(e) => setNewPole({ ...newPole, reference: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            />
            <Button
              variant="outlined"
              component="label"
              sx={{ borderRadius: 3, py: 1.5, textTransform: 'none', fontWeight: 700 }}
            >
              {poleImage ? `Foto: ${poleImage.name}` : 'Anexar Foto Real do Poste'}
              <input
                type="file"
                hidden
                accept="image/*"
                onChange={(e) => setPoleImage(e.target.files?.[0] || null)}
              />
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenPoleDialog(false)} sx={{ fontWeight: 700 }}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleCreatePole}
            disabled={savingPole}
            sx={{ borderRadius: 2, fontWeight: 800, px: 4 }}
          >
            {savingPole ? <CircularProgress size={24} /> : 'Cadastrar Poste'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
