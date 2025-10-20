import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Dimensions,
  StatusBar,
  Image,
  Modal,
  Switch,
  ActivityIndicator,
  Platform,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const { width } = Dimensions.get('window');

// Google Vision API Configuration - Replace with your actual API key
const GOOGLE_VISION_API_KEY = '***REMOVED***';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function BillboardReporterApp() {
  const [activeTab, setActiveTab] = useState('home');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    notifications: true,
    locationServices: true,
    autoLocation: false
  });

  const [newReport, setNewReport] = useState({
    title: '',
    location: '',
    description: '',
    category: 'advertisement',
    image: null,
    coordinates: null,
    timestamp: null,
    aiAnalysis: null
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // Categories for reporting
  const categories = [
    { label: 'Advertisement', value: 'advertisement', icon: 'megaphone' },
    { label: 'Damaged Billboard', value: 'damaged', icon: 'warning' },
    { label: 'Illegal Placement', value: 'illegal', icon: 'ban' },
    { label: 'Inappropriate Content', value: 'inappropriate', icon: 'eye-off' },
    { label: 'Other', value: 'other', icon: 'ellipsis-horizontal' }
  ];

  // Load data on app start
  useEffect(() => {
    loadStoredData();
    requestPermissions();
  }, []);

  // Request permissions
  const requestPermissions = async () => {
    // Camera permission
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    // Location permission
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    
    // Notification permission
    const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
    
    if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is needed to take photos of billboards.');
    }
    
    if (locationStatus !== 'granted') {
      Alert.alert('Permission needed', 'Location access helps auto-fill your location.');
    }
  };

  // Load stored data
  const loadStoredData = async () => {
    try {
      const storedReports = await AsyncStorage.getItem('billboardReports');
      const storedSettings = await AsyncStorage.getItem('appSettings');
      
      if (storedReports) {
        setReports(JSON.parse(storedReports));
      } else {
        // Initialize with sample data
        const sampleReports = [
          {
            id: '1',
            title: "Coca-Cola Billboard",
            location: "Highway 101, Mile 23",
            status: "Likely Authorized",
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            category: 'advertisement',
            description: 'Large red billboard advertising Coca-Cola',
            image: null,
            coordinates: null,
            aiAnalysis: null,
            violations: [],
            aiConfidence: 0.85
          },
          {
            id: '2',
            title: "McDonald's Ad",
            location: "Downtown Main St",
            status: "Needs Review",
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            category: 'advertisement',
            description: 'Yellow arches billboard for McDonald\'s',
            image: null,
            coordinates: null,
            aiAnalysis: null,
            violations: ['Billboard appears larger than permitted size for this zone'],
            aiConfidence: 0.45
          }
        ];
        setReports(sampleReports);
        await AsyncStorage.setItem('billboardReports', JSON.stringify(sampleReports));
      }
      
      if (storedSettings) {
        setSettings(JSON.parse(storedSettings));
      }
    } catch (error) {
      console.error('Error loading stored data:', error);
    }
  };

  // Save data
  const saveReports = async (newReports) => {
    try {
      await AsyncStorage.setItem('billboardReports', JSON.stringify(newReports));
    } catch (error) {
      console.error('Error saving reports:', error);
    }
  };

  const saveSettings = async (newSettings) => {
    try {
      await AsyncStorage.setItem('appSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // AI Processing Functions
  const processImageWithAI = async (imageUri) => {
    try {
      setLoading(true);
      
      // Convert image to base64
      const base64Image = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Google Vision API request
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                { type: 'TEXT_DETECTION', maxResults: 50 },
                { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
                { type: 'LOGO_DETECTION', maxResults: 10 }
              ],
            },
          ],
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      return analyzeVisionResults(result);
      
    } catch (error) {
      console.error('Vision API Error:', error);
      Alert.alert('Processing Error', 'Could not analyze image. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const analyzeVisionResults = (visionData) => {
    const analysis = {
      extractedText: '',
      detectedObjects: [],
      logos: [],
      billboardInfo: {
        hasBillboard: false,
        estimatedSize: null,
        advertisementText: '',
        brandName: '',
        potentialViolations: []
      }
    };

    if (visionData.responses && visionData.responses[0]) {
      const response = visionData.responses[0];
      
      // Extract text
      if (response.textAnnotations) {
        analysis.extractedText = response.textAnnotations[0]?.description || '';
        analysis.billboardInfo.advertisementText = analysis.extractedText;
      }
      
      // Detect objects (look for billboard/sign structures)
      if (response.localizedObjectAnnotations) {
        response.localizedObjectAnnotations.forEach(obj => {
          analysis.detectedObjects.push({
            name: obj.name,
            confidence: obj.score,
            boundingBox: obj.boundingPoly
          });
          
          // Check if it's a billboard/sign
          if (obj.name.toLowerCase().includes('sign') || 
              obj.name.toLowerCase().includes('billboard') ||
              obj.name.toLowerCase().includes('advertisement')) {
            analysis.billboardInfo.hasBillboard = true;
            analysis.billboardInfo.estimatedSize = estimateSizeFromBoundingBox(obj.boundingPoly);
          }
        });
      }
      
      // Detect logos/brands
      if (response.logoAnnotations) {
        response.logoAnnotations.forEach(logo => {
          analysis.logos.push({
            description: logo.description,
            confidence: logo.score
          });
          
          if (logo.score > 0.5) {
            analysis.billboardInfo.brandName = logo.description;
          }
        });
      }
    }
    
    // Run authorization checks
    analysis.authorizationStatus = checkBillboardAuthorization(analysis);
    
    return analysis;
  };

  const estimateSizeFromBoundingBox = (boundingPoly) => {
    if (!boundingPoly || !boundingPoly.normalizedVertices) return null;
    
    const vertices = boundingPoly.normalizedVertices;
    const width = Math.abs(vertices[1].x - vertices[0].x);
    const height = Math.abs(vertices[2].y - vertices[0].y);
    
    // Rough size estimation (you'd calibrate this based on distance/perspective)
    const area = width * height;
    
    if (area > 0.3) return 'Large (>300 sq ft)';
    if (area > 0.1) return 'Medium (100-300 sq ft)';
    return 'Small (<100 sq ft)';
  };

  const checkBillboardAuthorization = (analysis) => {
    const violations = [];
    const status = {
      isAuthorized: true,
      confidence: 0.5,
      violations: violations,
      recommendations: []
    };
    
    // Check 1: Size compliance (mock data - replace with real database)
    const maxAllowedSize = getMaxAllowedSizeForLocation(newReport.coordinates);
    if (analysis.billboardInfo.estimatedSize === 'Large (>300 sq ft)' && maxAllowedSize === 'Medium') {
      violations.push('Billboard appears larger than permitted size for this zone');
      status.isAuthorized = false;
    }
    
    // Check 2: Content restrictions
    const prohibitedContent = ['tobacco', 'alcohol', 'gambling', 'casino'];
    const extractedText = analysis.extractedText.toLowerCase();
    
    prohibitedContent.forEach(content => {
      if (extractedText.includes(content)) {
        violations.push(`Contains potentially prohibited content: ${content}`);
        status.isAuthorized = false;
      }
    });
    
    // Check 3: Location restrictions (mock - replace with real data)
    if (isNearSchoolOrChurch(newReport.coordinates)) {
      violations.push('Billboard may be too close to school/religious institution');
      status.confidence = 0.3;
    }
    
    // Check 4: Required permit information
    if (!analysis.extractedText.toLowerCase().includes('permit') && 
        !analysis.extractedText.toLowerCase().includes('license')) {
      violations.push('No visible permit information detected');
      status.confidence = Math.max(status.confidence - 0.2, 0.1);
    }
    
    // Calculate confidence score
    if (violations.length === 0) {
      status.confidence = 0.8;
    } else {
      status.confidence = Math.max(0.1, 0.8 - (violations.length * 0.15));
    }
    
    return status;
  };

  // Mock functions - replace with real database queries
  const getMaxAllowedSizeForLocation = (coordinates) => {
    // This would query your permit database
    return 'Medium'; // Mock response
  };

  const isNearSchoolOrChurch = (coordinates) => {
    // This would check distance to protected locations
    return Math.random() > 0.7; // Mock response
  };

  const showAnalysisResults = (analysis) => {
    const { authorizationStatus, billboardInfo } = analysis;
    
    let message = `AI Analysis Complete!\n\n`;
    message += `🎯 Billboard Detected: ${billboardInfo.hasBillboard ? 'Yes' : 'No'}\n`;
    message += `📏 Estimated Size: ${billboardInfo.estimatedSize || 'Unknown'}\n`;
    message += `🏷️ Brand: ${billboardInfo.brandName || 'Not detected'}\n`;
    message += `✅ Status: ${authorizationStatus.isAuthorized ? 'Likely Authorized' : 'Potential Issues Found'}\n`;
    message += `🎯 Confidence: ${(authorizationStatus.confidence * 100).toFixed(1)}%\n\n`;
    
    if (authorizationStatus.violations.length > 0) {
      message += `⚠️ Potential Issues Found:\n`;
      authorizationStatus.violations.forEach((violation, index) => {
        message += `${index + 1}. ${violation}\n`;
      });
    }
    
    Alert.alert(
      authorizationStatus.isAuthorized ? 'Billboard Analysis' : 'Potential Violations Detected',
      message,
      [
        { text: 'View Details', onPress: () => showDetailedAnalysis(analysis) },
        { text: 'Continue', style: 'default' }
      ]
    );
  };

  const showDetailedAnalysis = (analysis) => {
    const detectedText = analysis.extractedText.substring(0, 200);
    const objectList = analysis.detectedObjects.map(obj => `${obj.name} (${(obj.confidence * 100).toFixed(1)}%)`).join(', ');
    const logoList = analysis.logos.map(logo => `${logo.description} (${(logo.confidence * 100).toFixed(1)}%)`).join(', ');
    
    Alert.alert('Detailed AI Analysis', `
📝 Extracted Text: 
${detectedText}${analysis.extractedText.length > 200 ? '...' : ''}

🔍 Detected Objects: 
${objectList || 'None detected'}

🏷️ Logos Found: 
${logoList || 'None detected'}

⚖️ Authorization Details:
${analysis.authorizationStatus.violations.length > 0 ? 
  analysis.authorizationStatus.violations.join('\n• ') : 
  'No violations detected based on current checks'}
    `);
  };

  // Get current location
  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      const location = await Location.getCurrentPositionAsync({});
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      
      if (address[0]) {
        const formattedAddress = `${address[0].street || ''} ${address[0].city || ''} ${address[0].region || ''}`.trim();
        setNewReport(prev => ({
          ...prev,
          location: formattedAddress,
          coordinates: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          }
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Could not get current location. Please enter manually.');
    } finally {
      setLoading(false);
    }
  };

  // Enhanced image picker with AI processing
  const openCameraWithProcessing = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8, // Higher quality for better OCR
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        
        // Update UI with image immediately
        setNewReport(prev => ({
          ...prev,
          image: imageUri
        }));
        
        // Show processing message
        Alert.alert('Processing Image', 'Analyzing billboard with AI for compliance...', 
          [{ text: 'OK' }], { cancelable: false });
        
        // Process image with AI
        const analysis = await processImageWithAI(imageUri);
        
        if (analysis) {
          // Auto-fill form with extracted data
          const brandName = analysis.billboardInfo.brandName || 
                           (analysis.extractedText.split('\n')[0]?.substring(0, 30)) || '';
          
          setNewReport(prev => ({
            ...prev,
            title: brandName || prev.title,
            description: prev.description + 
                        (prev.description ? '\n\n' : '') +
                        `AI Analysis Results:\n` +
                        `• Detected Text: ${analysis.extractedText.substring(0, 100)}${analysis.extractedText.length > 100 ? '...' : ''}\n` +
                        `• Estimated Size: ${analysis.billboardInfo.estimatedSize || 'Unknown'}\n` +
                        `• Authorization Status: ${analysis.authorizationStatus.isAuthorized ? 'Likely Authorized' : 'Potential Violations'}\n` +
                        `• AI Confidence: ${(analysis.authorizationStatus.confidence * 100).toFixed(1)}%`,
            aiAnalysis: analysis // Store for later use
          }));
          
          // Show results
          showAnalysisResults(analysis);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Could not process image. Please try again.');
    }
  };

  // Handle image picker
  const pickImage = () => {
    Alert.alert(
      'Add Billboard Photo',
      'Choose how to capture the billboard image',
      [
        { 
          text: '📸 Camera + AI Analysis', 
          onPress: () => openCameraWithProcessing(),
          style: 'default'
        },
        { text: '📷 Camera Only', onPress: () => openCamera() },
        { text: '🖼️ Gallery', onPress: () => openGallery() },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openCamera = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setNewReport(prev => ({
          ...prev,
          image: result.assets[0].uri
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open camera');
    }
  };

  const openGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setNewReport(prev => ({
          ...prev,
          image: result.assets[0].uri
        }));
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open gallery');
    }
  };

  // Enhanced submit report with AI data
  const handleSubmitReport = async () => {
    if (!newReport.title.trim() || !newReport.location.trim()) {
      Alert.alert('Error', 'Please fill in title and location fields.');
      return;
    }

    try {
      setLoading(true);
      
      const report = {
        id: Date.now().toString(),
        ...newReport,
        status: newReport.aiAnalysis?.authorizationStatus?.isAuthorized ? "Likely Authorized" : "Needs Review",
        timestamp: new Date().toISOString(),
        aiConfidence: newReport.aiAnalysis?.authorizationStatus?.confidence || null,
        violations: newReport.aiAnalysis?.authorizationStatus?.violations || []
      };

      const updatedReports = [report, ...reports];
      setReports(updatedReports);
      await saveReports(updatedReports);
      
      // Send notification
      if (settings.notifications) {
        const notificationBody = report.aiAnalysis ? 
          `Analysis complete. ${report.violations.length > 0 ? `${report.violations.length} potential violation(s) found.` : 'No issues detected.'}` :
          'Your billboard report has been submitted successfully.';
          
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Report Submitted',
            body: notificationBody,
          },
          trigger: { seconds: 1 },
        });
      }

      // Reset form
      setNewReport({
        title: '',
        location: '',
        description: '',
        category: 'advertisement',
        image: null,
        coordinates: null,
        timestamp: null,
        aiAnalysis: null
      });

      setActiveTab('reports');
      
      const successMessage = report.aiAnalysis ? 
        `Report submitted successfully!\n\nAI Analysis: ${report.violations.length > 0 ? 
          `${report.violations.length} potential violation(s) detected` : 
          'No compliance issues found'}` :
        'Report submitted successfully!';
        
      Alert.alert('Success', successMessage);
      
    } catch (error) {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Delete report
  const deleteReport = async (reportId) => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedReports = reports.filter(report => report.id !== reportId);
            setReports(updatedReports);
            await saveReports(updatedReports);
          }
        }
      ]
    );
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const now = new Date();
    const reportTime = new Date(timestamp);
    const diffInMinutes = Math.floor((now - reportTime) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return `${Math.floor(diffInMinutes / 1440)} days ago`;
  };

  // Open in maps
  const openInMaps = (coordinates, location) => {
    if (coordinates) {
      const url = Platform.select({
        ios: `maps:0,0?q=${coordinates.latitude},${coordinates.longitude}`,
        android: `geo:0,0?q=${coordinates.latitude},${coordinates.longitude}`,
      });
      Linking.openURL(url);
    } else {
      const encodedLocation = encodeURIComponent(location);
      const url = Platform.select({
        ios: `maps:0,0?q=${encodedLocation}`,
        android: `geo:0,0?q=${encodedLocation}`,
      });
      Linking.openURL(url);
    }
  };

  const renderHome = () => (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="analytics" size={40} color="white" />
        </View>
        <Text style={styles.titleText}>Billboard Reporter</Text>
        <Text style={styles.subtitleText}>AI-powered billboard compliance monitoring</Text>
      </View>

      {/* Statistics Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{reports.length}</Text>
          <Text style={styles.statLabel}>Total Reports</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{reports.filter(r => r.status === 'Likely Authorized').length}</Text>
          <Text style={styles.statLabel}>Authorized</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{reports.filter(r => r.violations && r.violations.length > 0).length}</Text>
          <Text style={styles.statLabel}>Issues</Text>
        </View>
      </View>

      <View style={styles.cardGrid}>
        <TouchableOpacity 
          style={styles.card}
          onPress={() => setActiveTab('new-report')}
        >
          <Ionicons name="add-circle" size={32} color="#2563eb" />
          <Text style={styles.cardTitle}>New Report</Text>
          <Text style={styles.cardSubtitle}>AI analysis included</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.card}
          onPress={() => setActiveTab('reports')}
        >
          <Ionicons name="list" size={32} color="#16a34a" />
          <Text style={styles.cardTitle}>My Reports</Text>
          <Text style={styles.cardSubtitle}>View all reports</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.activityCard}>
        <Text style={styles.activityTitle}>Recent Activity</Text>
        {reports.slice(0, 3).map((report) => (
          <TouchableOpacity 
            key={report.id} 
            style={styles.activityItem}
            onPress={() => {
              setSelectedReport(report);
              setModalVisible(true);
            }}
          >
            <View style={styles.activityLeft}>
              {report.image ? (
                <Image source={{ uri: report.image }} style={styles.activityImage} />
              ) : (
                <View style={styles.activityImagePlaceholder}>
                  <Ionicons name="image" size={20} color="#6b7280" />
                </View>
              )}
              <View>
                <Text style={styles.activityItemTitle}>{report.title}</Text>
                <Text style={styles.activityItemLocation}>{report.location}</Text>
                <Text style={styles.activityItemTime}>{formatTimestamp(report.timestamp)}</Text>
                {report.aiConfidence && (
                  <Text style={styles.aiConfidenceText}>
                    AI Confidence: {(report.aiConfidence * 100).toFixed(0)}%
                  </Text>
                )}
              </View>
            </View>
            <View style={[
              styles.statusBadge,
              report.status === 'Likely Authorized' ? styles.statusActive : 
              report.violations && report.violations.length > 0 ? styles.statusViolation : styles.statusPending
            ]}>
              <Text style={[
                styles.statusText,
                report.status === 'Likely Authorized' ? styles.statusActiveText :
                report.violations && report.violations.length > 0 ? styles.statusViolationText : styles.statusPendingText
              ]}>
                {report.violations && report.violations.length > 0 ? 'Issues' : report.status}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
        {reports.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyStateText}>No reports yet</Text>
            <Text style={styles.emptyStateSubtext}>Create your first AI-powered report</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderNewReport = () => (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>New Billboard Report</Text>
        <Text style={styles.formSubtitle}>AI-powered compliance checking</Text>
      </View>

      <View style={styles.formCard}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Billboard Title/Brand *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., Coca-Cola, McDonald's, Nike"
            placeholderTextColor="#999"
            value={newReport.title}
            onChangeText={(value) => setNewReport({...newReport, title: value})}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Location *</Text>
          <View style={styles.locationContainer}>
            <View style={styles.inputWithIcon}>
              <Ionicons name="location" size={20} color="#9ca3af" style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, styles.textInputWithIcon]}
                placeholder="Street address or landmark"
                placeholderTextColor="#999"
                value={newReport.location}
                onChangeText={(value) => setNewReport({...newReport, location: value})}
              />
            </View>
            <TouchableOpacity 
              style={styles.locationButton}
              onPress={getCurrentLocation}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Ionicons name="locate" size={20} color="#2563eb" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.value}
                style={[
                  styles.categoryButton,
                  newReport.category === category.value && styles.categoryButtonActive
                ]}
                onPress={() => setNewReport({...newReport, category: category.value})}
              >
                <Ionicons 
                  name={category.icon} 
                  size={20} 
                  color={newReport.category === category.value ? '#2563eb' : '#6b7280'} 
                />
                <Text style={[
                  styles.categoryButtonText,
                  newReport.category === category.value && styles.categoryButtonTextActive
                ]}>
                  {category.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Description</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Additional details about the billboard..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
            value={newReport.description}
            onChangeText={(value) => setNewReport({...newReport, description: value})}
          />
        </View>

        <TouchableOpacity style={styles.photoUpload} onPress={pickImage}>
          {newReport.image ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: newReport.image }} style={styles.uploadedImage} />
              <TouchableOpacity 
                style={styles.removeImageButton}
                onPress={() => setNewReport({...newReport, image: null, aiAnalysis: null})}
              >
                <Ionicons name="close" size={16} color="white" />
              </TouchableOpacity>
              {newReport.aiAnalysis && (
                <View style={styles.aiIndicator}>
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  <Text style={styles.aiIndicatorText}>AI Analyzed</Text>
                </View>
              )}
            </View>
          ) : (
            <>
              <Ionicons name="camera" size={48} color="#9ca3af" />
              <Text style={styles.photoText}>Add Photo</Text>
              <Text style={styles.photoSubtext}>Tap for AI-powered analysis</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmitReport}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="send" size={20} color="white" />
              <Text style={styles.submitButtonText}>Submit Report</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderReports = () => (
    <View style={styles.container}>
      <View style={styles.reportsHeader}>
        <Text style={styles.reportsTitle}>My Reports</Text>
        <Text style={styles.reportsSubtitle}>{reports.length} total reports</Text>
      </View>
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {reports.map((report) => (
          <TouchableOpacity 
            key={report.id} 
            style={styles.reportCard}
            onPress={() => {
              setSelectedReport(report);
              setModalVisible(true);
            }}
          >
            <View style={styles.reportCardHeader}>
              <View style={styles.reportCardLeft}>
                {report.image ? (
                  <Image source={{ uri: report.image }} style={styles.reportCardImage} />
                ) : (
                  <View style={styles.reportCardImagePlaceholder}>
                    <Ionicons name="image" size={24} color="#6b7280" />
                  </View>
                )}
                <View style={styles.reportCardContent}>
                  <Text style={styles.reportCardTitle}>{report.title}</Text>
                  <Text style={styles.reportCardLocation}>{report.location}</Text>
                  <Text style={styles.reportCardTime}>{formatTimestamp(report.timestamp)}</Text>
                  {report.aiConfidence && (
                    <View style={styles.aiConfidenceContainer}>
                      <Ionicons name="analytics" size={14} color="#6366f1" />
                      <Text style={styles.aiConfidenceText}>
                        AI: {(report.aiConfidence * 100).toFixed(0)}% confidence
                      </Text>
                    </View>
                  )}
                  {report.violations && report.violations.length > 0 && (
                    <View style={styles.violationsContainer}>
                      <Ionicons name="warning" size={14} color="#f59e0b" />
                      <Text style={styles.violationsText}>
                        {report.violations.length} issue(s) detected
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.reportCardRight}>
                <View style={[
                  styles.statusBadge,
                  report.status === 'Likely Authorized' ? styles.statusActive : 
                  report.violations && report.violations.length > 0 ? styles.statusViolation : styles.statusPending
                ]}>
                  <Text style={[
                    styles.statusText,
                    report.status === 'Likely Authorized' ? styles.statusActiveText :
                    report.violations && report.violations.length > 0 ? styles.statusViolationText : styles.statusPendingText
                  ]}>
                    {report.violations && report.violations.length > 0 ? 'Issues' : report.status}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => deleteReport(report.id)}
                >
                  <Ionicons name="trash" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}
        
        {reports.length === 0 && (
          <View style={styles.emptyReportsState}>
            <Ionicons name="folder-open-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyReportsTitle}>No Reports Yet</Text>
            <Text style={styles.emptyReportsText}>
              Start by creating your first AI-powered billboard report
            </Text>
            <TouchableOpacity 
              style={styles.createFirstReportButton}
              onPress={() => setActiveTab('new-report')}
            >
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.createFirstReportButtonText}>Create First Report</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderSettings = () => (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.settingsHeader}>
        <Text style={styles.settingsTitle}>Settings</Text>
        <Text style={styles.settingsSubtitle}>Customize your app experience</Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsSectionTitle}>Notifications</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="notifications" size={24} color="#6366f1" />
            <View>
              <Text style={styles.settingTitle}>Push Notifications</Text>
              <Text style={styles.settingDescription}>Get notified about report status</Text>
            </View>
          </View>
          <Switch
            value={settings.notifications}
            onValueChange={(value) => saveSettings({...settings, notifications: value})}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="location" size={24} color="#10b981" />
            <View>
              <Text style={styles.settingTitle}>Location Services</Text>
              <Text style={styles.settingDescription}>Auto-detect your location</Text>
            </View>
          </View>
          <Switch
            value={settings.locationServices}
            onValueChange={(value) => saveSettings({...settings, locationServices: value})}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="locate" size={24} color="#f59e0b" />
            <View>
              <Text style={styles.settingTitle}>Auto Location Fill</Text>
              <Text style={styles.settingDescription}>Automatically fill location in forms</Text>
            </View>
          </View>
          <Switch
            value={settings.autoLocation}
            onValueChange={(value) => saveSettings({...settings, autoLocation: value})}
          />
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsSectionTitle}>About</Text>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="information-circle" size={24} color="#6b7280" />
            <View>
              <Text style={styles.settingTitle}>App Version</Text>
              <Text style={styles.settingDescription}>Billboard Reporter v1.0.0</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="analytics" size={24} color="#8b5cf6" />
            <View>
              <Text style={styles.settingTitle}>AI Features</Text>
              <Text style={styles.settingDescription}>Powered by Google Vision API</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderReportModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Report Details</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          
          {selectedReport && (
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedReport.image && (
                <Image source={{ uri: selectedReport.image }} style={styles.modalImage} />
              )}
              
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Basic Information</Text>
                <Text style={styles.modalText}>
                  <Text style={styles.modalLabel}>Title: </Text>
                  {selectedReport.title}
                </Text>
                <Text style={styles.modalText}>
                  <Text style={styles.modalLabel}>Location: </Text>
                  {selectedReport.location}
                </Text>
                <Text style={styles.modalText}>
                  <Text style={styles.modalLabel}>Category: </Text>
                  {selectedReport.category}
                </Text>
                <Text style={styles.modalText}>
                  <Text style={styles.modalLabel}>Status: </Text>
                  {selectedReport.status}
                </Text>
                <Text style={styles.modalText}>
                  <Text style={styles.modalLabel}>Submitted: </Text>
                  {formatTimestamp(selectedReport.timestamp)}
                </Text>
              </View>

              {selectedReport.aiConfidence && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>AI Analysis</Text>
                  <View style={styles.aiAnalysisCard}>
                    <View style={styles.confidenceIndicator}>
                      <Ionicons name="analytics" size={20} color="#6366f1" />
                      <Text style={styles.confidenceText}>
                        Confidence: {(selectedReport.aiConfidence * 100).toFixed(1)}%
                      </Text>
                    </View>
                    {selectedReport.violations && selectedReport.violations.length > 0 && (
                      <View style={styles.violationsSection}>
                        <Text style={styles.violationsSectionTitle}>Detected Issues:</Text>
                        {selectedReport.violations.map((violation, index) => (
                          <View key={index} style={styles.violationItem}>
                            <Ionicons name="warning" size={16} color="#f59e0b" />
                            <Text style={styles.violationText}>{violation}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}

              {selectedReport.description && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Description</Text>
                  <Text style={styles.modalText}>{selectedReport.description}</Text>
                </View>
              )}

              <View style={styles.modalActions}>
                {selectedReport.coordinates && (
                  <TouchableOpacity 
                    style={styles.modalActionButton}
                    onPress={() => openInMaps(selectedReport.coordinates, selectedReport.location)}
                  >
                    <Ionicons name="map" size={20} color="#2563eb" />
                    <Text style={styles.modalActionText}>View on Map</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity 
                  style={[styles.modalActionButton, styles.modalActionButtonDanger]}
                  onPress={() => {
                    setModalVisible(false);
                    deleteReport(selectedReport.id);
                  }}
                >
                  <Ionicons name="trash" size={20} color="#ef4444" />
                  <Text style={[styles.modalActionText, styles.modalActionTextDanger]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity 
        style={[styles.tabItem, activeTab === 'home' && styles.tabItemActive]}
        onPress={() => setActiveTab('home')}
      >
        <Ionicons 
          name={activeTab === 'home' ? 'home' : 'home-outline'} 
          size={24} 
          color={activeTab === 'home' ? '#2563eb' : '#6b7280'} 
        />
        <Text style={[styles.tabText, activeTab === 'home' && styles.tabTextActive]}>Home</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.tabItem, activeTab === 'new-report' && styles.tabItemActive]}
        onPress={() => setActiveTab('new-report')}
      >
        <Ionicons 
          name={activeTab === 'new-report' ? 'add-circle' : 'add-circle-outline'} 
          size={24} 
          color={activeTab === 'new-report' ? '#2563eb' : '#6b7280'} 
        />
        <Text style={[styles.tabText, activeTab === 'new-report' && styles.tabTextActive]}>New Report</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.tabItem, activeTab === 'reports' && styles.tabItemActive]}
        onPress={() => setActiveTab('reports')}
      >
        <Ionicons 
          name={activeTab === 'reports' ? 'list' : 'list-outline'} 
          size={24} 
          color={activeTab === 'reports' ? '#2563eb' : '#6b7280'} 
        />
        <Text style={[styles.tabText, activeTab === 'reports' && styles.tabTextActive]}>Reports</Text>
        {reports.filter(r => r.violations && r.violations.length > 0).length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {reports.filter(r => r.violations && r.violations.length > 0).length}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.tabItem, activeTab === 'settings' && styles.tabItemActive]}
        onPress={() => setActiveTab('settings')}
      >
        <Ionicons 
          name={activeTab === 'settings' ? 'settings' : 'settings-outline'} 
          size={24} 
          color={activeTab === 'settings' ? '#2563eb' : '#6b7280'} 
        />
        <Text style={[styles.tabText, activeTab === 'settings' && styles.tabTextActive]}>Settings</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      
      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Processing with AI...</Text>
          </View>
        </View>
      )}
      
      {/* Main content */}
      {activeTab === 'home' && renderHome()}
      {activeTab === 'new-report' && renderNewReport()}
      {activeTab === 'reports' && renderReports()}
      {activeTab === 'settings' && renderSettings()}
      
      {/* Modal */}
      {renderReportModal()}
      
      {/* Tab bar */}
      {renderTabBar()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  // Header styles
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 20,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  titleText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Stats cards
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Card grid
  cardGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  card: {
    flex: 1,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 8,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Activity card
  activityCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  activityImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  activityItemLocation: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  activityItemTime: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  aiConfidenceText: {
    fontSize: 11,
    color: '#6366f1',
    marginTop: 2,
  },
  // Form styles
  formHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  formCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  textInputWithIcon: {
    paddingLeft: 40,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWithIcon: {
    flex: 1,
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    top: 12,
    zIndex: 1,
  },
  locationButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  // Category scroll
  categoryScroll: {
    marginHorizontal: -4,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  categoryButtonText: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 6,
  },
  categoryButtonTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  // Photo upload
  photoUpload: {
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
  },
  photoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 8,
  },
  photoSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  imageContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  uploadedImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  aiIndicatorText: {
    fontSize: 12,
    color: '#16a34a',
    marginLeft: 4,
    fontWeight: '600',
  },
  // Submit button
  submitButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Reports styles
  reportsHeader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  reportsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  reportsSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  reportCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  reportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reportCardLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  reportCardImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  reportCardImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reportCardContent: {
    flex: 1,
  },
  reportCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  reportCardLocation: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  reportCardTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  aiConfidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  violationsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  violationsText: {
    fontSize: 12,
    color: '#f59e0b',
    marginLeft: 4,
  },
  reportCardRight: {
    alignItems: 'center',
    gap: 8,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Status badges
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#dcfce7',
  },
  statusPending: {
    backgroundColor: '#fef3c7',
  },
  statusViolation: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusActiveText: {
    color: '#16a34a',
  },
  statusPendingText: {
    color: '#d97706',
  },
  
  statusViolationText: {
    color: '#dc2626',
  },
  // Empty states
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  emptyReportsState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyReportsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyReportsText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
  },
  createFirstReportButton: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
  },
  createFirstReportButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Settings styles
  settingsHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 20,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  settingsSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  settingsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  settingsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
    marginLeft: 12,
  },
  settingDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 12,
    marginTop: 2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: 200,
    marginBottom: 20,
  },
  modalSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 8,
    lineHeight: 20,
  },
  modalLabel: {
    fontWeight: '600',
    color: '#1f2937',
  },
  aiAnalysisCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
  },
  confidenceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
    marginLeft: 8,
  },
  violationsSection: {
    marginTop: 8,
  },
  violationsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 8,
  },
  violationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  violationText: {
    fontSize: 13,
    color: '#7c2d12',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  modalActionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalActionButtonDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  modalActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  modalActionTextDanger: {
    color: '#ef4444',
  },
  // Tab bar styles
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    position: 'relative',
  },
  tabItemActive: {
    // No additional styles needed
  },
  tabText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  tabTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: '25%',
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Loading overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadingContainer: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingText: {
    fontSize: 16,
    color: '#374151',
    marginTop: 12,
    fontWeight: '500',
  },
});

