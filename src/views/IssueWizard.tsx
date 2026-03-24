import { useState, useEffect } from 'react';
import { 
  Typography, 
  Box, 
  Stepper, 
  Step, 
  StepLabel, 
  Button, 
  TextField, 
  Paper,
  CircularProgress,
  Alert,
  Container,
  Card,
  CardActionArea,
  Grid,
  IconButton,
  useTheme,
  useMediaQuery,
  FormControlLabel,
  Checkbox,
  Stack
} from '@mui/material';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { CloudUpload, LocationOn, Description, CheckCircle, ArrowBack, ArrowForward, MyLocation } from '@mui/icons-material';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import L from 'leaflet';
import { formatErrorMessage } from '../utils/errorUtils';
import { ISSUE_CATEGORIES, CATEGORY_ICONS, CATEGORY_DESCRIPTIONS } from '../constants';

// Fix for default marker icon in Leaflet
let DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const wizardCategories = ISSUE_CATEGORIES.map(cat => ({
  name: cat,
  icon: CATEGORY_ICONS[cat],
  description: CATEGORY_DESCRIPTIONS[cat]
}));

function LocationMarker({ position, setPosition }: any) {
  const map = useMap();
  
  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lng], map.getZoom());
    }
  }, [position, map]);

  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

export default function IssueWizard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [poleInfo, setPoleInfo] = useState<any>(null);
  const [isNearPole, setIsNearPole] = useState<boolean | null>(null);

  const [formData, setFormData] = useState({
    category: '',
    description: '',
    latitude: -11.6642,
    longitude: -39.0075,
    address: '',
    street: '',
    neighborhood: '',
    referencePoint: '',
    whatsapp: '',
    useMapLocation: true
  });

  useEffect(() => {
    const fetchPole = async () => {
      const poleId = localStorage.getItem('last_pole_id');
      if (poleId) {
        try {
          const res = await axios.get(`/api/poles/${poleId}`);
          setPoleInfo(res.data);
        } catch (e) {
          console.warn("Could not fetch pole info", e);
          localStorage.removeItem('last_pole_id');
        }
      }
    };
    fetchPole();
  }, []);
  const [image, setImage] = useState<File | null>(null);
  const [position, setPosition] = useState<any>({ lat: -11.6642, lng: -39.0075 });

  const detectLocation = async () => {
    setLoading(true);
    // Try browser geolocation first
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosition(newPos);
          setLoading(false);
        },
        async (err) => {
          console.warn("Geolocation denied or failed, falling back to IP", err);
          await fallbackToIP();
        },
        { timeout: 10000 }
      );
    } else {
      await fallbackToIP();
    }
  };

  const fallbackToIP = async () => {
    try {
      const res = await axios.get('https://ipapi.co/json/');
      if (res.data.latitude && res.data.longitude) {
        setPosition({ lat: res.data.latitude, lng: res.data.longitude });
      }
    } catch (e) {
      console.error("IP Location fallback failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    detectLocation();
  }, []);

  // Reverse Geocoding logic
  useEffect(() => {
    const reverseGeocode = async () => {
      if (!formData.useMapLocation || !position) return;
      
      setGeocoding(true);
      try {
        const res = await axios.get(`/api/geocode/reverse?lat=${position.lat}&lon=${position.lng}`);
        const address = res.data.address;
        
        setFormData(prev => ({
          ...prev,
          street: address.road || address.pedestrian || address.suburb || '',
          neighborhood: address.neighbourhood || address.suburb || address.city_district || '',
          address: res.data.display_name
        }));
      } catch (e) {
        // Silent failure for geocoding to avoid annoying the user, 
        // they can still type the address manually.
        console.warn("Reverse geocoding failed (proxy or Nominatim issue)", e);
      } finally {
        setGeocoding(false);
      }
    };

    const timer = setTimeout(reverseGeocode, 500);
    return () => clearTimeout(timer);
  }, [position, formData.useMapLocation]);

  const handleNext = () => setActiveStep((prev) => prev + 1);
  const handleBack = () => setActiveStep((prev) => prev - 1);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = new FormData();
      const fullAddress = `${formData.street}${formData.neighborhood ? ', ' + formData.neighborhood : ''}${formData.referencePoint ? ' (Ref: ' + formData.referencePoint + ')' : ''}`;
      
      const payload: any = {
        category: formData.category,
        description: formData.description,
        latitude: position.lat,
        longitude: position.lng,
        address: fullAddress || formData.address,
        whatsapp: formData.whatsapp || undefined
      };

      if (poleInfo) {
        payload.poleId = poleInfo.id;
        payload.isNearPole = isNearPole;
        payload.poleAddress = poleInfo.address;
        payload.poleReference = poleInfo.reference;
        payload.poleImageUrl = poleInfo.rawImageUrl;
      }

      data.append('data', JSON.stringify(payload));
      if (image) data.append('image', image);

      const response = await axios.post('/api/issues', data);
      setProtocol(response.data.protocol);
      localStorage.removeItem('last_pole_id');
      handleNext();
    } catch (err: any) {
      setError(formatErrorMessage(err, 'Erro ao enviar relato'));
    } finally {
      setLoading(false);
    }
  };

  const steps = poleInfo 
    ? ['Local', 'Categoria', 'Detalhes', 'Localização', 'Foto', 'Contato']
    : ['Categoria', 'Detalhes', 'Localização', 'Foto', 'Contato'];

  const renderStepContent = (step: number) => {
    // Adjust step index if poleInfo exists
    const adjustedStep = poleInfo ? step : step + 1;

    switch (adjustedStep) {
      case 0: // Pole Confirmation (Only if poleInfo exists)
        return (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              O problema está próximo ao poste onde você escaneou o QR Code?
            </Typography>
            
            {poleInfo.imageUrl && (
              <Box sx={{ mb: 3, borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)' }}>
                <img 
                  src={poleInfo.imageUrl} 
                  alt="Foto do Poste" 
                  style={{ width: '100%', maxHeight: 300, objectFit: 'cover' }} 
                  referrerPolicy="no-referrer"
                />
              </Box>
            )}
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              <strong>ID:</strong> {poleInfo.id}<br />
              <strong>Endereço:</strong> {poleInfo.address}<br />
              <strong>Ref:</strong> {poleInfo.reference}
            </Typography>

            <Stack direction="row" spacing={2} justifyContent="center">
              <Button 
                variant={isNearPole === true ? "contained" : "outlined"}
                onClick={() => {
                  setIsNearPole(true);
                  setFormData(prev => ({
                    ...prev,
                    street: poleInfo.address,
                    neighborhood: poleInfo.neighborhood || '',
                    referencePoint: '', // Clear to let user add their own
                    useMapLocation: false
                  }));
                }}
                sx={{ borderRadius: 3, px: 4, fontWeight: 700 }}
              >
                Sim
              </Button>
              <Button 
                variant={isNearPole === false ? "contained" : "outlined"}
                onClick={() => {
                  setIsNearPole(false);
                  setFormData(prev => ({
                    ...prev,
                    street: '',
                    neighborhood: '',
                    referencePoint: '',
                    useMapLocation: true
                  }));
                }}
                sx={{ borderRadius: 3, px: 4, fontWeight: 700 }}
              >
                Não
              </Button>
            </Stack>
          </Box>
        );
      case 1:
        return (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>Qual o tipo de problema?</Typography>
            <Grid container spacing={2}>
              {wizardCategories.map((cat) => (
                <Grid size={{ xs: 6, sm: 4 }} key={cat.name}>
                  <Card 
                    sx={{ 
                      height: '100%',
                      borderRadius: 3, 
                      border: formData.category === cat.name ? '2px solid' : '1px solid',
                      borderColor: formData.category === cat.name ? 'primary.main' : 'rgba(0,0,0,0.08)',
                      bgcolor: formData.category === cat.name ? 'primary.light' : 'white',
                      transition: 'all 0.2s'
                    }}
                  >
                    <CardActionArea 
                      onClick={() => setFormData({ ...formData, category: cat.name })}
                      sx={{ p: 2, textAlign: 'center', height: '100%' }}
                    >
                      <Typography variant="h4" sx={{ mb: 1 }}>{cat.icon}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2, mb: 0.5 }}>{cat.name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem', lineHeight: 1.1 }}>
                        {cat.description}
                      </Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        );
      case 2:
        return (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>Descreva o que aconteceu</Typography>
            <TextField
              label="Descrição detalhada"
              multiline
              rows={6}
              fullWidth
              required
              error={formData.description.trim() === ''}
              helperText={formData.description.trim() === '' ? 'Campo obrigatório' : ''}
              placeholder="Ex: Lâmpada do poste em frente à casa 123 está queimada há 3 dias..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            />
          </Box>
        );
      case 3:
        return (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Onde fica o problema?</Typography>
              {!isNearPole && (
                <IconButton size="small" onClick={detectLocation} disabled={loading} color="primary">
                  <MyLocation fontSize="small" />
                </IconButton>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {isNearPole 
                ? "Confirme os dados do poste e adicione uma referência extra se necessário." 
                : "Arraste o mapa ou clique para marcar o local exato."}
            </Typography>
            
            {!isNearPole && (
              <Box sx={{ height: 300, width: '100%', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', mb: 2, position: 'relative' }}>
                {loading && (
                  <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(255,255,255,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress size={32} />
                  </Box>
                )}
                <MapContainer center={[position.lat, position.lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <LocationMarker position={position} setPosition={setPosition} />
                </MapContainer>
              </Box>
            )}

            {!isNearPole && (
              <FormControlLabel
                control={
                  <Checkbox 
                    checked={formData.useMapLocation} 
                    onChange={(e) => setFormData({ ...formData, useMapLocation: e.target.checked })}
                  />
                }
                label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Usar a localização do mapa</Typography>}
                sx={{ mb: 2 }}
              />
            )}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Rua"
                  fullWidth
                  required
                  error={!formData.street}
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  disabled={isNearPole || (formData.useMapLocation && geocoding)}
                  InputProps={{
                    endAdornment: formData.useMapLocation && geocoding ? <CircularProgress size={16} /> : null
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Bairro"
                  fullWidth
                  required
                  error={!formData.neighborhood}
                  value={formData.neighborhood}
                  onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                  disabled={isNearPole || (formData.useMapLocation && geocoding)}
                  InputProps={{
                    endAdornment: formData.useMapLocation && geocoding ? <CircularProgress size={16} /> : null
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Ponto de Referência"
                  fullWidth
                  placeholder="Ex: Próximo à Padaria do João"
                  value={formData.referencePoint}
                  onChange={(e) => setFormData({ ...formData, referencePoint: e.target.value })}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                />
              </Grid>
            </Grid>
            {isNearPole && (
              <Alert severity="info" sx={{ mt: 2, borderRadius: 3 }}>
                <strong>Poste ID: {poleInfo.id}</strong><br />
                Referência do poste: {poleInfo.reference}
              </Alert>
            )}
          </Box>
        );
      case 4:
        return (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>Anexe uma foto do Lixo, Poste, buraco ou esgoto em questão</Typography>
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 4, 
                borderRadius: 4, 
                borderStyle: 'dashed', 
                bgcolor: 'rgba(0,0,0,0.01)',
                cursor: 'pointer',
                borderWidth: 2,
                borderColor: 'primary.main',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' },
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2
              }}
              onClick={() => document.getElementById('raised-button-file')?.click()}
            >
              <input
                accept="image/*"
                style={{ display: 'none' }}
                id="raised-button-file"
                type="file"
                onChange={(e) => setImage(e.target.files?.[0] || null)}
              />
              <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="body1" sx={{ fontWeight: 700 }}>Clique para selecionar ou tirar uma foto</Typography>
              <Typography variant="caption" color="text.secondary">Formatos aceitos: JPG, PNG</Typography>
              
              <Box sx={{ mt: 2 }}>
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById('raised-button-file')?.click();
                  }}
                  sx={{ borderRadius: 2, fontWeight: 700 }}
                >
                  CARREGAR / TIRAR FOTO
                </Button>
              </Box>
            </Paper>
            
            {image && (
              <Box sx={{ mt: 3, position: 'relative', display: 'inline-block' }}>
                <img 
                  src={URL.createObjectURL(image)} 
                  alt="Preview" 
                  style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                />
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>{image.name}</Typography>
              </Box>
            )}
          </Box>
        );
      case 5:
        return (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Deseja receber atualizações?</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Informe seu WhatsApp para receber o número do protocolo e ser avisado quando houver mudanças no status do seu relato.
            </Typography>
            
            <Stack spacing={3}>
              <TextField
                label="Seu WhatsApp (opcional)"
                fullWidth
                type="tel"
                placeholder="75999999999"
                value={formData.whatsapp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 11) {
                    setFormData({ ...formData, whatsapp: val });
                  }
                }}
                helperText="Apenas números com DDD. Ex: 75988887777"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              />
            </Stack>

            <Alert severity="info" sx={{ mt: 3, borderRadius: 3 }}>
              As informações de contato são opcionais, mas recomendadas para que você possa acompanhar seu relato.
            </Alert>
          </Box>
        );
      case 6:
        return (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box sx={{ width: 80, height: 80, bgcolor: 'success.light', color: 'success.main', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 3 }}>
              <CheckCircle sx={{ fontSize: 48 }} />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>Enviado!</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>Seu relato foi registrado com sucesso.</Typography>
            
            <Paper sx={{ p: 3, bgcolor: 'primary.light', borderRadius: 4, mb: 4 }}>
              <Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>Protocolo</Typography>
              <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main', mt: 1 }}>{protocol}</Typography>
            </Paper>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
              Você pode usar este número para acompanhar o andamento da sua solicitação na página inicial.
            </Typography>
            
            <Button 
              variant="contained" 
              fullWidth 
              size="large" 
              onClick={() => window.location.href = '/'}
              sx={{ borderRadius: 3, py: 1.5, fontWeight: 700 }}
            >
              Voltar ao Início
            </Button>
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 4, mb: 8 }}>
        {activeStep < steps.length && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>Relatar Problema</Typography>
            <Typography variant="body1" color="text.secondary">Siga os passos para nos informar sobre a zeladoria.</Typography>
          </Box>
        )}

        {activeStep < steps.length && (
          <Stepper 
            activeStep={activeStep} 
            orientation="horizontal"
            alternativeLabel
            sx={{ 
              mb: { xs: 4, sm: 6 }, 
              '& .MuiStepLabel-label': { 
                fontWeight: 600,
                fontSize: { xs: '0.65rem', sm: '0.875rem' },
                mt: 1
              },
              '& .MuiStepIcon-root': {
                fontSize: { xs: '1.2rem', sm: '1.5rem' }
              },
              '& .MuiStep-root': { py: 0 }
            }}
          >
            {steps.map((label) => (
              <Step key={label}><StepLabel>{label}</StepLabel></Step>
            ))}
          </Stepper>
        )}

        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>{error}</Alert>}

        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 5, border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
          <Box sx={{ minHeight: 350 }}>
            {renderStepContent(activeStep)}
          </Box>

          {activeStep < steps.length && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 6 }}>
              {activeStep === steps.length - 1 && (!formData.category || !formData.description.trim() || !formData.street || !formData.neighborhood) && (
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                  Por favor, volte e preencha todos os campos obrigatórios (Categoria, Descrição, Rua e Bairro).
                </Alert>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button 
                  disabled={activeStep === 0} 
                  onClick={handleBack}
                  startIcon={<ArrowBack />}
                  sx={{ fontWeight: 700 }}
                >
                  Voltar
                </Button>
                
                {activeStep === steps.length - 1 ? (
                  <Button 
                    variant="contained" 
                    onClick={handleSubmit} 
                    disabled={loading || !formData.category || !formData.description.trim() || !formData.street || !formData.neighborhood}
                    sx={{ borderRadius: 3, px: 4, fontWeight: 700 }}
                  >
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Finalizar Relato'}
                  </Button>
                ) : (
                  <Button 
                    variant="contained" 
                    onClick={handleNext}
                    disabled={
                      (poleInfo && activeStep === 0 && isNearPole === null) ||
                      (poleInfo ? activeStep === 1 : activeStep === 0) && !formData.category ||
                      (poleInfo ? activeStep === 2 : activeStep === 1) && !formData.description.trim() ||
                      (poleInfo ? activeStep === 3 : activeStep === 2) && (!formData.street || !formData.neighborhood)
                    }
                    endIcon={<ArrowForward />}
                    sx={{ borderRadius: 3, px: 4, fontWeight: 700 }}
                  >
                    Próximo
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
