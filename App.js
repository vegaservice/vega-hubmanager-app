// ████ VEGA HUB MANAGER APP v2.0 ████
// For Hub Managers — Android + iOS
// April 2026 — VEGA Home Services, Visakhapatnam

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, Alert, SafeAreaView, Dimensions,
  Animated, Modal, ActivityIndicator, RefreshControl,
  Linking, Platform,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';

const { width: W } = Dimensions.get('window');

const C = {
  bg:'#060A18', card:'#0A1020', card2:'#0E1428',
  blue:'#3B82F6', blue2:'#2563EB', blueBg:'#04081A', blueBd:'#1A2A5A',
  purple:'#A855F7', purpleBg:'#12082A', purpleBd:'#3A1060',
  green:'#22C55E', greenBg:'#041410', greenBd:'#1A3020',
  orange:'#E8520A', orangeBg:'#180A04', orangeBd:'#3A1A04',
  gold:'#D4901A', goldBg:'#181004', goldBd:'#4A3010',
  red:'#EF4444', redBg:'#180404', redBd:'#3A1010',
  text:'#EDF0F8', text2:'#A0AABF', muted:'#4A5580',
  border:'#0E1428', border2:'#1A2240',
};

const SHADOW = {
  card:{ shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.4,shadowRadius:8,elevation:4 },
  glow:{ shadowColor:C.blue,shadowOffset:{width:0,height:0},shadowOpacity:0.4,shadowRadius:12,elevation:6 },
};

const timeAgo=(ts)=>{
  if(!ts) return '';
  const d=ts.toDate?ts.toDate():new Date(ts);
  const diff=Math.floor((Date.now()-d.getTime())/1000);
  if(diff<60) return `${diff}s ago`;
  if(diff<3600) return `${Math.floor(diff/60)}m ago`;
  if(diff<86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString('en-IN');
};

const fmt=(n)=>n>=100000?`₹${(n/100000).toFixed(1)}L`:n>=1000?`₹${(n/1000).toFixed(1)}K`:`₹${n||0}`;

// ✅ FIX: Hub Manager phone whitelist — login works even without workers collection entry
const HUB_MANAGER_PHONES = ['9999999998', '9133222344'];

const JOB_STATUS={
  confirmed:{bg:C.redBg,text:C.red,label:'Needs Assignment'},
  assigned:{bg:C.goldBg,text:C.gold,label:'Assigned'},
  on_the_way:{bg:C.greenBg,text:C.green,label:'On the Way'},
  in_progress:{bg:C.purpleBg,text:C.purple,label:'In Progress'},
  completed:{bg:C.greenBg,text:C.green,label:'Completed'},
  rejected:{bg:C.redBg,text:C.red,label:'Rejected'},
  cancelled:{bg:C.redBg,text:C.red,label:'Cancelled'},
};

const WORKER_STATUS={
  active:{bg:C.greenBg,text:C.green},
  suspended:{bg:C.goldBg,text:C.gold},
  blocked:{bg:C.redBg,text:C.red},
};

const fbUpdate=async(col,id,data)=>{
  try{await firestore().collection(col).doc(id).update({...data,updatedAt:firestore.FieldValue.serverTimestamp()});return true;}
  catch(e){console.error('fbUpdate:',e);return false;}
};
const fbSet=async(col,id,data)=>{
  try{await firestore().collection(col).doc(id).set(data);return true;}
  catch(e){console.error('fbSet:',e);return false;}
};
const fbAdd=async(col,data)=>{
  try{const r=await firestore().collection(col).add({...data,createdAt:firestore.FieldValue.serverTimestamp()});return r.id;}
  catch(e){console.error('fbAdd:',e);return null;}
};

export default function App() {
  const [screen,setScreen]=useState('splash');
  const [tab,setTab]=useState('dashboard');
  const [phone,setPhone]=useState('');
  const [otpVal,setOtpVal]=useState('');
  const [confirm,setConfirm]=useState(null);
  const [loading,setLoading]=useState(false);
  const [manager,setManager]=useState(null);
  const [jobs,setJobs]=useState([]);
  const [workers,setWorkers]=useState([]);
  const [complaints,setComplaints]=useState([]);
  const [selJob,setSelJob]=useState(null);
  const [selWorker,setSelWorker]=useState(null);
  const [refreshing,setRefreshing]=useState(false);
  const [assignModal,setAssignModal]=useState(false);
  const [addWorkerModal,setAddWorkerModal]=useState(false);
  const [complaintModal,setComplaintModal]=useState(false);
  const [selComplaint,setSelComplaint]=useState(null);

  // Add worker form
  const [empName,setEmpName]=useState('');
  const [empPhone,setEmpPhone]=useState('');
  const [empRole,setEmpRole]=useState('worker');
  const [empArea,setEmpArea]=useState('Madhurawada');
  const [empServices,setEmpServices]=useState(['Home Cleaning']);

  const fadeAnim=useRef(new Animated.Value(0)).current;

  useEffect(()=>{
    Animated.timing(fadeAnim,{toValue:1,duration:1200,useNativeDriver:true}).start();
    setTimeout(()=>setScreen('login'),2500);
  },[]);

  useEffect(()=>{
    if(!manager) return;
    // Real-time listeners
    const unsubJobs=firestore().collection('bookings').orderBy('createdAt','desc').limit(100)
      .onSnapshot(snap=>setJobs(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const unsubWorkers=firestore().collection('workers').where('isActive','==',true)
      .onSnapshot(snap=>setWorkers(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const unsubComplaints=firestore().collection('complaints').orderBy('createdAt','desc').limit(50)
      .onSnapshot(snap=>setComplaints(snap.docs.map(d=>({id:d.id,...d.data()}))));
    // FCM
    const unsubFCM=messaging().onMessage(async msg=>{
      Alert.alert(msg.notification?.title||'�udbb7 VEGA',msg.notification?.body||'New update');
    });
    return()=>{ unsubJobs(); unsubWorkers(); unsubComplaints(); unsubFCM(); };
  },[manager]);

  // AUTH
  const sendOTP=async()=>{
    if(!phone||phone.length<10){Alert.alert('Enter valid number');return;}
    setLoading(true);
    try{
      const c=await auth().signInWithPhoneNumber(`+91${phone}`);
      setConfirm(c); setLoading(false); setScreen('otp');
    }catch(e){setLoading(false);Alert.alert('OTP Failed',e.message);}
  };

  const verifyOTP=async()=>{
    if(!otpVal||otpVal.length<6) return;
    setLoading(true);
    try{
      await confirm.confirm(otpVal);
      // Check workers collection first
      let mgr = null;
      const snap=await firestore().collection('workers').where('phone','==',phone).where('role','==','hub_manager').limit(1).get();
      if(!snap.empty){
        mgr={id:snap.docs[0].id,...snap.docs[0].data()};
      } else if(HUB_MANAGER_PHONES.includes(phone)){
        // ✅ Phone whitelisted — auto-create hub manager profile
        const mgrId=`manager_${phone}`;
        mgr={id:mgrId,name:'Hub Manager',phone,role:'hub_manager',currentArea:'Madhurawada',status:'active',isActive:true,isAvailable:false};
        await firestore().collection('workers').doc(mgrId).set({...mgr,joinedAt:firestore.FieldValue.serverTimestamp()},{merge:true});
      } else {
        auth().signOut();setLoading(false);
        Alert.alert('Access Denied','Not registered as Hub Manager. Contact admin: 9441270570');return;
      }
      // Save FCM token so Cloud Functions can push notifications to this device
      try{
        const fcmTok=await messaging().getToken();
        if(fcmTok) await firestore().collection('workers').doc(mgr.id).update({fcmToken:fcmTok});
      }catch(e){console.log('FCM token error:',e);}
      setManager(mgr); setLoading(false); setScreen('main');
      // Save FCM token for push notifications
      try {
        await messaging().requestPermission();
        const fcmToken = await messaging().getToken();
        if (fcmToken && mgr.id) {
          await firestore().collection('workers').doc(mgr.id).update({
            fcmToken, fcmUpdatedAt: firestore.FieldValue.serverTimestamp()
          });
        }
      } catch(fcmErr) { console.log('FCM token save:', fcmErr.message); }
    }catch(e){setLoading(false);Alert.alert('Wrong OTP',e.message);}
  };

  const onRefresh=async()=>{setRefreshing(true);setTimeout(()=>setRefreshing(false),1000);};

  // ASSIGN WORKER — Smart suggestion by rating + availability
  const smartSuggest=(jobServiceType)=>{
    const available=workers.filter(w=>w.isAvailable&&w.status==='active'&&w.role!=='hub_manager');
    // Sort by rating desc, then totalJobsCompleted desc
    return available.sort((a,b)=>{
      const ra=a.ratingAvg||a.rating||4.0;
      const rb=b.ratingAvg||b.rating||4.0;
      if(rb!==ra) return rb-ra;
      return (b.totalJobsCompleted||0)-(a.totalJobsCompleted||0);
    });
  };

  const assignWorker=async(job,worker)=>{
    const ok=await fbUpdate('bookings',job.id,{
      assignedWorkerId:worker.id,
      assignedWorkerName:worker.name,
      assignedWorkerPhone:worker.phone,
      status:'assigned',
      assignedAt:firestore.FieldValue.serverTimestamp(),
      // Hub manager can see price, worker cannot
    });
    if(ok){Alert.alert('✅ Assigned!',`${worker.name} assigned to job ${job.orderId||job.id?.slice(-6)}`);setAssignModal(false);setSelJob(null);}
  };

  const reassignWorker=async(job,worker)=>{
    const ok=await fbUpdate('bookings',job.id,{
      assignedWorkerId:worker.id,
      assignedWorkerName:worker.name,
      assignedWorkerPhone:worker.phone,
      reassignedAt:firestore.FieldValue.serverTimestamp(),
    });
    if(ok){Alert.alert('🔄 Reassigned!',`${worker.name} is now assigned.`);setAssignModal(false);}
  };

  const updateJobStatus=async(job,status)=>{
    await fbUpdate('bookings',job.id,{status,[`${status}At`]:firestore.FieldValue.serverTimestamp()});
    Alert.alert('Updated',`Job ${job.orderId||job.id?.slice(-6)} → ${status}`);
  };

  // WORKER CONTROL
  const changeWorkerStatus=async(worker,status)=>{
    Alert.alert(`${status==='active'?'Activate':status==='suspended'?'Suspend':'Block'} Worker`,
      `${status==='blocked'?'Blocked workers cannot login or receive jobs.':status==='suspended'?'Suspended workers cannot receive new jobs.':'Worker will be reactivated.'}\n\nProceed with ${worker.name}?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Confirm',style:status==='active'?'default':'destructive',onPress:async()=>{
        await fbUpdate('workers',worker.id,{status});
        Alert.alert('Done',`${worker.name} is now ${status}.`);
      }},
    ]);
  };

  const addWorker=async()=>{
    if(!empName||!empPhone){Alert.alert('Fill all fields');return;}
    const id=`worker_${empPhone}`;
    await fbSet('workers',id,{
      id,name:empName,phone:empPhone,role:empRole,
      status:'active',isAvailable:true,isActive:true,
      currentArea:empArea,assignedAreas:[empArea],
      services:empServices,
      ratingAvg:4.9,totalReviews:0,totalJobsCompleted:0,
      performanceScore:85,
      attendance:{jobsToday:0,jobsWeek:0,daysPresent:0,daysAbsent:0},
      earnings:{today:0,thisWeek:0,thisMonth:0,total:0},
      salary:12000,
      joinedAt:firestore.FieldValue.serverTimestamp(),
    });
    setAddWorkerModal(false);setEmpName('');setEmpPhone('');
    Alert.alert('✅ Added',`${empName} added as ${empRole}`);
  };

  // COMPLAINTS
  const resolveComplaint=async(complaint,resolution)=>{
    await fbUpdate('complaints',complaint.id,{status:'resolved',resolution,resolvedAt:firestore.FieldValue.serverTimestamp()});
    setSelComplaint(null);
    Alert.alert('✅ Resolved','Complaint marked as resolved.');
  };

  // COMPUTED
  const todayStr=new Date().toDateString();
  const todayJobs=jobs.filter(j=>{const d=j.createdAt?.toDate?j.createdAt.toDate():new Date(j.createdAt||0);return d.toDateString()===todayStr;});
  const unassigned=jobs.filter(j=>j.status?.toLowerCase()==='confirmed'&&!j.assignedWorkerId);
  const inProgress=jobs.filter(j=>['on_the_way','in_progress'].includes(j.status));
  // Revenue hidden from Hub Manager
  const avgRating=jobs.filter(j=>j.rating).length?
    (jobs.filter(j=>j.rating).reduce((s,j)=>s+(j.rating||0),0)/jobs.filter(j=>j.rating).length).toFixed(1):'—';
  const openComplaints=complaints.filter(c=>c.status!=='resolved');

  // SPLASH
  if(screen==='splash') return(
    <View style={{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center'}}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <Animated.View style={{opacity:fadeAnim,alignItems:'center'}}>
        <Text style={{fontSize:60}}>�udbb7</Text>
        <Text style={{fontSize:34,fontWeight:'900',color:C.blue,letterSpacing:6,marginTop:12}}>VEGA</Text>
        <Text style={{fontSize:14,color:C.text2,marginTop:8,letterSpacing:2}}>HUB MANAGER</Text>
        <View style={{width:40,height:2,backgroundColor:C.blue,borderRadius:1,marginTop:16}}/>
        <Text style={{fontSize:11,color:C.muted,marginTop:12}}>Madhurawada Operations Hub</Text>
      </Animated.View>
    </View>
  );

  // LOGIN
  if(screen==='login') return(
    <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={{flex:1,padding:24,justifyContent:'center'}}>
        <Text style={{fontSize:32}}>�udbb7</Text>
        <Text style={{fontSize:28,fontWeight:'900',color:C.blue,marginTop:12}}>Hub Manager</Text>
        <Text style={{fontSize:14,color:C.text2,marginTop:6,marginBottom:40}}>VEGA Operations Login</Text>
        <Text style={S.lbl}>Mobile Number</Text>
        <View style={S.phoneRow}>
          <Text style={S.flag}>🇮🇳 +91</Text>
          <TextInput style={S.phoneInp} placeholder="Registered number" placeholderTextColor={C.muted}
            keyboardType="number-pad" maxLength={10} value={phone} onChangeText={setPhone} color={C.text}/>
        </View>
        <TouchableOpacity style={[S.btn,phone.length<10&&{opacity:0.4},{marginTop:24}]} disabled={phone.length<10||loading} onPress={sendOTP}>
          {loading?<ActivityIndicator color="#FFF"/>:<Text style={S.btnT}>Send OTP →</Text>}
        </TouchableOpacity>
        <View style={{marginTop:28,backgroundColor:C.blueBg,borderRadius:14,padding:14,borderWidth:0.5,borderColor:C.blueBd}}>
          <Text style={{color:C.blue,fontWeight:'700',fontSize:13}}>🔒 Hub Managers Only</Text>
          <Text style={{color:C.text2,fontSize:12,marginTop:4}}>Contact admin 9441270570 for access.</Text>
        </View>
      </View>
    </SafeAreaView>
  );

  // OTP
  if(screen==='otp') return(
    <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
      <View style={{flex:1,padding:24,justifyContent:'center'}}>
        <TouchableOpacity onPress={()=>setScreen('login')} style={{marginBottom:32}}>
          <Text style={{color:C.blue,fontSize:16}}>← Back</Text>
        </TouchableOpacity>
        <Text style={{fontSize:24,fontWeight:'900',color:C.text}}>Enter OTP</Text>
        <Text style={{fontSize:13,color:C.muted,marginTop:4,marginBottom:28}}>Sent to +91 {phone}</Text>
        <TextInput style={[S.inp,{fontSize:32,fontWeight:'900',letterSpacing:16,textAlign:'center',paddingVertical:20}]}
          placeholder="——————" placeholderTextColor={C.border2} keyboardType="number-pad" maxLength={6}
          value={otpVal} onChangeText={setOtpVal} color={C.text}/>
        <TouchableOpacity style={[S.btn,otpVal.length<6&&{opacity:0.4},{marginTop:24}]} disabled={otpVal.length<6||loading} onPress={verifyOTP}>
          {loading?<ActivityIndicator color="#FFF"/>:<Text style={S.btnT}>Verify & Enter →</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // JOB DETAIL MODAL
  const JobDetailModal=()=>{
    if(!selJob) return null;
    const sc=JOB_STATUS[selJob.status]||JOB_STATUS.confirmed;
    const suggested=smartSuggest(selJob.serviceType);
    return(
      <Modal visible={!!selJob} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
            <TouchableOpacity onPress={()=>{setSelJob(null);setAssignModal(false);}}><Text style={{color:C.blue,fontSize:16}}>← Back</Text></TouchableOpacity>
            <Text style={{color:C.text,fontWeight:'700'}}>{selJob.orderId||selJob.id?.slice(-6)}</Text>
            <View style={{paddingHorizontal:10,paddingVertical:3,borderRadius:10,backgroundColor:sc.bg}}>
              <Text style={{color:sc.text,fontSize:11,fontWeight:'700'}}>{sc.label}</Text>
            </View>
          </View>
          <ScrollView style={{padding:16}}>

            {/* Customer */}
            <View style={S.detailCard}>
              <Text style={S.detailLabel}>👤 CUSTOMER</Text>
              <Text style={{color:C.text,fontSize:16,fontWeight:'700',marginTop:8}}>{selJob.customerName||selJob.userName}</Text>
              <Text style={{color:C.text2,fontSize:13,marginTop:4}}>📞 +91 {selJob.userPhone||selJob.customerPhone}</Text>
              <Text style={{color:C.text2,fontSize:13,marginTop:4}}>📍 {selJob.addressFull||'Address'}</Text>
              <Text style={{color:C.text2,fontSize:13,marginTop:4}}>📅 {selJob.slot||selJob.scheduledTime}</Text>
              <TouchableOpacity style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:12,backgroundColor:C.greenBg,padding:12,borderRadius:12,borderWidth:0.5,borderColor:C.greenBd}}
                onPress={()=>Linking.openURL(`tel:+91${selJob.userPhone||selJob.customerPhone}`)}>
                <Text style={{fontSize:18}}>📞</Text><Text style={{color:C.green,fontWeight:'700'}}>Call Customer</Text>
              </TouchableOpacity>
            </View>

            <View style={S.detailCard}>
              <Text style={S.detailLabel}>🛠 SERVICES</Text>
              {(selJob.items||[{name:selJob.serviceType||'Home Cleaning'}]).map((item,i)=>(
                <View key={i} style={{flexDirection:'row',justifyContent:'space-between',marginTop:10}}>
                  <Text style={{color:C.text2,flex:1}}>{item.name}{item.variant?` (${item.variant})`:''}</Text>
                </View>
              ))}
            </View>

            {/* Delay flags */}
            {selJob.delayFlag&&(
              <View style={[S.detailCard,{borderColor:C.redBd,borderWidth:1}]}>
                <Text style={S.detailLabel}>⚠️ DELAY FLAG</Text>
                <Text style={{color:C.red,fontSize:13,marginTop:8}}>
                  This job has a delay flag. Check with the worker.
                </Text>
                <TouchableOpacity style={{marginTop:10,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.orangeBg,padding:12,borderRadius:12,borderWidth:0.5,borderColor:C.orangeBd}}
                  onPress={()=>selJob.assignedWorkerPhone&&Linking.openURL(`tel:+91${selJob.assignedWorkerPhone}`)}>
                  <Text style={{fontSize:16}}>📞</Text><Text style={{color:C.orange,fontWeight:'700'}}>Call Worker</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Photos proof */}
            <View style={S.detailCard}>
              <Text style={S.detailLabel}}>📸 PHOTO PROOF</Text>
              <View style={{flexDirection:'row',gap:12,marginTop:10}}>
                <View style={{flex:1,backgroundColor:(selJob.beforePhotos||[]).length>0?C.greenBg:C.redBg,borderRadius:12,padding:12,borderWidth:0.5,borderColor:(selJob.beforePhotos||[]).length>0?C.greenBd:C.redBd}}>
                  <Text style={{color:(selJob.beforePhotos||[]).length>0?C.green:C.red,fontWeight:'700',fontSize:12,textAlign:'center'}}>
                    Before: {(selJob.beforePhotos||[]).length} photos
                  </Text>
                </View>
                <View style={{flex:1,backgroundColor:(selJob.afterPhotos||[]).length>0?C.greenBg:C.card2,borderRadius:12,padding:12,borderWidth:0.5,borderColor:(selJob.afterPhotos||[]).length>0?C.greenBd:C.border2}}>
                  <Text style={{color:(selJob.afterPhotos||[]).length>0?C.green:C.muted,fontWeight:'700',fontSize:12,textAlign:'center'}}>
                    After: {(selJob.afterPhotos||[]).length} photos
                  </Text>
                </View>
              </View>
            </View>

            {/* Professional */}
            {selJob.assignedWorkerName?(
              <View style={S.detailCard}>
                <Text style={S.detailLabel}}>👩 ASSIGNED PROFESSIONAL</Text>
                <Text style={{color:C.text,fontSize:15,fontWeight:'700',marginTop:8}}>{selJob.assignedWorkerName}</Text>
                <View style={{flexDirection:'row',gap:10,marginTop:12}}>
                  <TouchableOpacity style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:C.greenBg,padding:12,borderRadius:12,borderWidth:0.5,borderColor:C.greenBd}}
                    onPress={()=>Linking.openURL(`tel:+91${selJob.assignedWorkerPhone}`)}>
                    <Text style={{fontSize:16}}>📞</Text><Text style={{color:C.green,fontWeight:'700',fontSize:13}}>Call Worker</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:C.blueBg,padding:12,borderRadius:12,borderWidth:0.5,borderColor:C.blueBd}}
                    onPress={()=>setAssignModal(true)}>
                    <Text style={{fontSize:16}}>🔄</Text><Text style={{color:C.blue,fontWeight:'700',fontSize:13}}>Reassign</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ):(
              <TouchableOpacity style={[S.btn,{marginBottom:12}]} onPress={()=>setAssignModal(true)}>
                <Text style={S.btnT}}>👩 Assign Professional Now</Text>
              </TouchableOpacity>
            )}

            {/* OTP */}
            <View style={S.detailCard}>
              <Text style={S.detailLabel}}>🔐 BOOKING OTP</Text>
              <Text style={{color:C.gold,fontSize:32,fontWeight:'900',marginTop:8,letterSpacing:8}}>{selJob.otp}</Text>
              <Text style={{color:C.muted,fontSize:11,marginTop:4}}>Worker enters this to start service</Text>
            </View>

            {/* Status control */}
            <View style={S.detailCard}>
              <Text style={S.detailLabel}}>⚡ UPDATE STATUS</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12}}>
                {Object.entries(JOB_STATUS).map(([st,sc])=>(
                  <TouchableOpacity key={st} onPress={()=>updateJobStatus(selJob,st)}
                    style={{paddingHorizontal:12,paddingVertical:6,borderRadius:16,
                      backgroundColor:selJob.status===st?C.blue:C.card2,
                      borderWidth:1,borderColor:selJob.status===st?C.blue:C.border2}}>
                    <Text style={{color:selJob.status===st?'#FFF':C.text2,fontSize:11,fontWeight:'600',textTransform:'capitalize'}}>{st.replace('_',' ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{height:40}}/>
          </ScrollView>
        </SafeAreaView>

        {/* Assign Modal with Smart Suggestion */}
        <Modal visible={assignModal} animationType="slide" presentationStyle="formSheet">
          <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
              <TouchableOpacity onPress={()=>setAssignModal(false)}><Text style={{color:C.red}}>Cancel</Text></TouchableOpacity>
              <Text style={{color:C.text,fontWeight:'700'}}>Select Professional</Text>
              <View style={{width:60}}/>
            </View>
            <ScrollView style={{padding:16}}>
              {/* Smart suggestion banner */}
              <View style={{backgroundColor:C.blueBg,borderRadius:14,padding:12,marginBottom:16,borderWidth:0.5,borderColor:C.blueBd,flexDirection:'row',gap:10}}>
                <Text style={{fontSize:18}}>🧠</Text>
                <View style={{flex:1}}>
                  <Text style={{color:C.blue,fontWeight:'700',fontSize:13}}>Smart Suggestions</Text>
                  <Text style={{color:C.text2,fontSize:11,marginTop:2}}>Sorted by rating + availability. Top-rated available workers shown first.</Text>
                </View>
              </View>

              {smartSuggest(selJob?.serviceType).map((w,i)=>(
                <TouchableOpacity key={w.id}
                  style={[S.card,{flexDirection:'row',alignItems:'center',marginBottom:10,
                    borderColor:i===0?C.gold:C.border2,borderWidth:i===0?1.5:0.5}]}
                  onPress={()=>selJob.assignedWorkerName?reassignWorker(selJob,w):assignWorker(selJob,w)}>
                  {i===0&&(
                    <View style={{position:'absolute',top:-8,right:12,backgroundColor:C.gold,paddingHorizontal:8,paddingVertical:2,borderRadius:8}}>
                      <Text style={{color:'#FFF',fontSize:9,fontWeight:'900'}}>⭐ BEST MATCH</Text>
                    </View>
                  )}
                  <View style={{width:44,height:44,borderRadius:22,backgroundColor:C.blueBg,alignItems:'center',justifyContent:'center',marginRight:14,borderWidth:1,borderColor:C.blueBd}}>
                    <Text style={{color:C.blue,fontWeight:'900',fontSize:18}}>{w.name?.[0]||'?'}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{color:C.text,fontWeight:'700'}}>{w.name}</Text>
                    <Text style={{color:C.muted,fontSize:12}}>📍 {w.currentArea} · ⭐ {w.ratingAvg||w.rating||4.9}</Text>
                    <Text style={{color:C.muted,fontSize:11}}>{w.totalJobsCompleted||0} jobs done</Text>
                  </View>
                  <View style={{paddingHorizontal:10,paddingVertical:3,borderRadius:10,backgroundColor:C.greenBg,borderWidth:0.5,borderColor:C.greenBd}}>
                    <Text style={{color:C.green,fontSize:10,fontWeight:'700'}}>● Free</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {smartSuggest(selJob?.serviceType).length===0&&(
                <View style={{alignItems:'center',padding:40}}>
                  <Text style={{fontSize:48}}>😔</Text>
                  <Text style={{color:C.muted,marginTop:12,textAlign:'center'}}>No available workers right now.\nCheck team availability.</Text>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </Modal>
    );
  };

  // WORKER DETAIL MODAL
  const WorkerDetailModal=()=>{
    if(!selWorker) return null;
    const ws=WORKER_STATUS[selWorker.status]||WORKER_STATUS.active;
    return(
      <Modal visible={!!selWorker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
            <TouchableOpacity onPress={()=>setSelWorker(null)}><Text style={{color:C.blue,fontSize:16}}>← Back</Text></TouchableOpacity>
            <Text style={{color:C.text,fontWeight:'700'}}>Worker Details</Text>
            <View style={{width:60}}/>
          </View>
          <ScrollView style={{padding:16}}>
            {/* Profile */}
            <View style={[S.detailCard,{alignItems:'center',paddingVertical:24}]}>
              <View style={{width:64,height:64,borderRadius:32,backgroundColor:C.blueBg,alignItems:'center',justifyContent:'center',marginBottom:12,borderWidth:2,borderColor:C.blueBd}}>
                <Text style={{fontSize:28,fontWeight:'900',color:C.blue}}>{selWorker.name?.[0]||'?'}</Text>
              </View>
              <Text style={{color:C.text,fontSize:18,fontWeight:'900'}}>{selWorker.name}</Text>
              <Text style={{color:C.text2,marginTop:4}}>📞 +91 {selWorker.phone}</Text>
              <View style={{marginTop:10,paddingHorizontal:12,paddingVertical:4,borderRadius:12,backgroundColor:ws.bg,borderWidth:0.5,borderColor:C.border2}}>
                <Text style={{color:ws.text,fontSize:12,fontWeight:'700',textTransform:'capitalize'}}>● {selWorker.status}</Text>
              </View>
              <Text style={{color:C.gold,fontSize:13,marginTop:8}}>⭐ {selWorker.ratingAvg||4.9} · {selWorker.totalReviews||0} reviews</Text>
            </View>

            {/* Stats */}
            <View style={[S.detailCard,{marginBottom:12}]}>
              <Text style={S.detailLabel}}>📊 PERFORMANCE</Text>
              {[
                {label:'Jobs Completed',val:selWorker.totalJobsCompleted||0,color:C.green},
                {label:'Performance Score',val:`${selWorker.performanceScore||85}%`,color:C.orange},
                {label:'Days Present',val:selWorker.attendance?.daysPresent||0,color:C.blue},
                {label:'Area',val:selWorker.currentArea||'Madhurawada',color:C.text2},
                {label:'Role',val:selWorker.role==='hub_manager'?'Hub Manager':'Worker',color:C.gold},
              ].map((item,i)=>(
                <View key={i} style={{flexDirection:'row',justifyContent:'space-between',marginTop:10}}>
                  <Text style={{color:C.muted,fontSize:13}}>{item.label}</Text>
                  <Text style={{color:item.color,fontWeight:'700'}}>{item.val}</Text>
                </View>
              ))}
            </View>

            {/* Earnings — Hub Manager CAN see */}
            <View style={[S.detailCard,{marginBottom:12}]}>
              <Text style={S.detailLabel}}>💰 EARNINGS (ADMIN VISIBLE)</Text>
              {[
                {label:'Today',val:fmt(selWorker.earnings?.today||0)},
                {label:'This Week',val:fmt(selWorker.earnings?.thisWeek||0)},
                {label:'This Month',val:fmt(selWorker.earnings?.thisMonth||0)},
  
              ].map((item,i)=>(
                <View key={i} style={{flexDirection:'row',justifyContent:'space-between',marginTop:10}}>
                  <Text style={{color:C.muted,fontSize:13}}>{item.label}</Text>
                  <Text style={{color:C.blue,fontWeight:'700'}}>{item.val}</Text>
                </View>
              ))}
            </View>

            {/* Worker Control */}
            <View style={[S.detailCard,{marginBottom:12}]}>
              <Text style={S.detailLabel}}>⚙️ WORKER CONTROL</Text>
              <Text style={{color:C.text2,fontSize:12,marginTop:8,marginBottom:14}}>Change worker status. Blocked workers cannot login or receive jobs.</Text>
              <View style={{flexDirection:'row',gap:10}}>
                {[
                  {status:'active',label:'Activate',color:C.green,bg:C.greenBg,bd:C.greenBd},
                  {status:'suspended',label:'Suspend',color:C.gold,bg:C.goldBg,bd:C.goldBd},
                  {status:'blocked',label:'Block',color:C.red,bg:C.redBg,bd:C.redBd},
                ].map(item=>(
                  <TouchableOpacity key={item.status}
                    style={{flex:1,padding:12,borderRadius:12,alignItems:'center',
                      backgroundColor:selWorker.status===item.status?item.bg:C.card2,
                      borderWidth:1,borderColor:selWorker.status===item.status?item.bd:C.border2}}
                    onPress={()=>changeWorkerStatus(selWorker,item.status)}>
                    <Text style={{color:selWorker.status===item.status?item.color:C.muted,fontWeight:'700',fontSize:12}}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{height:40}}/>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // DASHBOARD TAB
  const DashboardTab=()=>(
    <ScrollView style={{flex:1}} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue}/>}>
      <View style={{padding:20,paddingTop:8}}>
        <Text style={{fontSize:11,color:C.muted,letterSpacing:2}}>MADHURAWADA HUB</Text>
        <Text style={{fontSize:24,fontWeight:'900',color:C.text,marginTop:4}}>Hub Dashboard �udbb7</Text>
        <Text style={{fontSize:13,color:C.muted}}>{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</Text>
      </View>

      {/* Urgent alerts */}
      {unassigned.length>0&&(
        <TouchableOpacity style={{marginHorizontal:16,marginBottom:12,backgroundColor:C.redBg,borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:C.redBd}}
          onPress={()=>setTab('bookings')}>
          <Text style={{fontSize:22}}>🚨</Text>
          <View style={{flex:1}}>
            <Text style={{color:C.red,fontWeight:'800',fontSize:15}}>{unassigned.length} Unassigned Booking{unassigned.length>1?'s':''}!</Text>
            <Text style={{color:C.text2,fontSize:12,marginTop:2}}>Assign professionals now</Text>
          </View>
          <Text style={{color:C.red,fontSize:22}}>›</Text>
        </TouchableOpacity>
      )}
      {openComplaints.length>0&&(
        <TouchableOpacity style={{marginHorizontal:16,marginBottom:12,backgroundColor:C.goldBg,borderRadius:16,padding:14,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:C.goldBd}}
          onPress={()=>setTab('complaints')}>
          <Text style={{fontSize:20}}>⚠️</Text>
          <Text style={{flex:1,color:C.gold,fontWeight:'700'}}>{openComplaints.length} Open Complaint{openComplaints.length>1?'s':''}</Text>
          <Text style={{color:C.gold,fontSize:20}}>›</Text>
        </TouchableOpacity>
      )}

      {/* Stats grid */}
      <View style={{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:12,gap:10,marginBottom:16}}>
        {[
          {label:"Today's Bookings",val:todayJobs.length,icon:'📦',color:C.blue},
          {label:"Completed Today",val:todayJobs.filter(j=>j.status==='completed').length,icon:'✅',color:C.green},
          {label:'In Progress',val:inProgress.length,icon:'⚡',color:C.purple},
          {label:'Unassigned',val:unassigned.length,icon:'🚨',color:unassigned.length>0?C.red:C.green},
          {label:'Available Staff',val:workers.filter(w=>w.isAvailable&&w.status==='active'&&w.role!=='hub_manager').length,icon:'✅',color:C.green},
          {label:'Avg Rating',val:`${avgRating} ⭐`,icon:'⭐',color:C.gold},
        ].map((stat,i)=>(
          <View key={i} style={{width:(W-40)/2,backgroundColor:C.card,borderRadius:18,padding:16,borderWidth:0.5,borderColor:C.border2,...SHADOW.card}}>
            <Text style={{fontSize:26}}>{stat.icon}</Text>
            <Text style={{fontSize:22,fontWeight:'900',color:stat.color,marginTop:8}}>{stat.val}</Text>
            <Text style={{fontSize:11,color:C.muted,marginTop:4}}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Live worker status */}
      <View style={{paddingHorizontal:16,marginBottom:16}}>
        <Text style={{fontSize:16,fontWeight:'800',color:C.text,marginBottom:12}}>👥 Live Worker Status</Text>
        {workers.filter(w=>w.role!=='hub_manager').slice(0,5).map(w=>(
          <TouchableOpacity key={w.id} style={[S.card,{flexDirection:'row',alignItems:'center',marginBottom:8}]}
            onPress={()=>setSelWorker(w)}>
            <View style={{width:40,height:40,borderRadius:20,backgroundColor:C.blueBg,alignItems:'center',justifyContent:'center',marginRight:12}}>
              <Text style={{color:C.blue,fontWeight:'900',fontSize:16}}>{w.name?.[0]||'?'}</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={{color:C.text,fontWeight:'700'}}>{w.name}</Text>
              <Text style={{color:C.muted,fontSize:11}}>📍 {w.currentArea} · ⭐ {w.ratingAvg||4.9}</Text>
            </View>
            <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
              <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,
                backgroundColor:w.status!=='active'?C.redBg:w.isAvailable?C.greenBg:C.orangeBg,
                borderWidth:0.5,borderColor:w.status!=='active'?C.redBd:w.isAvailable?C.greenBd:C.orangeBd}}>
                <Text style={{color:w.status!=='active'?C.red:w.isAvailable?C.green:C.orange,fontSize:9,fontWeight:'700'}}>
                  {w.status!=='active'?w.status.toUpperCase():w.isAvailable?'Free':'On Job'}
                </Text>
              </View>
              <TouchableOpacity onPress={()=>Linking.openURL(`tel:+91${w.phone}`)}>
                <Text style={{fontSize:18}}>📞</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent bookings */}
      <View style={{paddingHorizontal:16,marginBottom:16}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:12}}>
          <Text style={{fontSize:16,fontWeight:'800',color:C.text}}>Recent Bookings</Text>
          <TouchableOpacity onPress={()=>setTab('bookings')}><Text style={{color:C.blue,fontSize:13}}>See all →</Text></TouchableOpacity>
        </View>
        {jobs.slice(0,5).map(b=>{
          const sc=JOB_STATUS[b.status]||JOB_STATUS.confirmed;
          return(
            <TouchableOpacity key={b.id} style={[S.card,{flexDirection:'row',alignItems:'center',marginBottom:8}]}
              onPress={()=>setSelJob(b)}>
              <View style={{flex:1}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:4}}>
                  <Text style={{color:C.blue,fontWeight:'700'}}>{b.orderId||b.id?.slice(-6)}</Text>
                  <View style={{paddingHorizontal:6,paddingVertical:2,borderRadius:8,backgroundColor:sc.bg}}>
                    <Text style={{color:sc.text,fontSize:9,fontWeight:'700'}}>{sc.label}</Text>
                  </View>
                  {b.delayFlag&&<Text style={{color:C.red,fontSize:10}}>⚠️</Text>}
                </View>
                <Text style={{color:C.text2,fontSize:12}}>{b.customerName||b.userName}</Text>
                <Text style={{color:C.muted,fontSize:11,marginTop:1}}>{timeAgo(b.createdAt)}</Text>
              </View>
              <Text style={{color:C.muted,fontSize:11}}>{timeAgo(b.createdAt)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{height:100}}/>
    </ScrollView>
  );

  // BOOKINGS TAB
  const BookingsTab=()=>{
    const [filter,setFilter]=useState('All');
    const filterMap={
      'All':jobs,
      'Unassigned':jobs.filter(j=>j.status?.toLowerCase()==='confirmed'&&!j.assignedWorkerId),
      'Active':jobs.filter(j=>['assigned','on_the_way','in_progress'].includes(j.status)),
      'Completed':jobs.filter(j=>j.status==='completed'),
    };
    const shown=filterMap[filter]||[];
    return(
      <View style={{flex:1}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{paddingHorizontal:16,paddingVertical:10,maxHeight:50}}>
          {Object.entries(filterMap).map(([key,arr])=>(
            <TouchableOpacity key={key} onPress={()=>setFilter(key)}
              style={{paddingHorizontal:16,paddingVertical:6,borderRadius:20,marginRight:8,
                backgroundColor:filter===key?C.blue2:C.card,borderWidth:1,borderColor:filter===key?C.blue:C.border2}}>
              <Text style={{color:filter===key?'#FFF':C.text2,fontWeight:'600',fontSize:12}}>{key} ({arr.length})</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView style={{flex:1,padding:16}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue}/>}>
          {shown.map(b=>{
            const sc=JOB_STATUS[b.status]||JOB_STATUS.confirmed;
            return(
              <TouchableOpacity key={b.id} style={[S.card,{marginBottom:10}]} onPress={()=>setSelJob(b)}>
                <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <View style={{flex:1}}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:6}}>
                      <Text style={{color:C.blue,fontWeight:'800',fontSize:14}}>{b.orderId||b.id?.slice(-6)}</Text>
                      <View style={{paddingHorizontal:8,paddingVertical:2,borderRadius:10,backgroundColor:sc.bg}}>
                        <Text style={{color:sc.text,fontSize:10,fontWeight:'700'}}>{sc.label}</Text>
                      </View>
                      {b.delayFlag&&<Text style={{color:C.red,fontSize:10}}>⚠️ Delay</Text>}
                    </View>
                    <Text style={{color:C.text,fontSize:14,fontWeight:'600'}}>{b.customerName||b.userName}</Text>
                    <Text style={{color:C.muted,fontSize:12,marginTop:2}}>📍 {(b.addressFull||'').substring(0,45)}</Text>
                    <Text style={{color:C.muted,fontSize:11,marginTop:2}}>📅 {b.slot||b.scheduledTime}</Text>
                    {b.bookingMode==='recurring'&&b.recurFreq&&(
                      <View style={{flexDirection:'row',alignItems:'center',gap:4,marginTop:3}}>
                        <View style={{backgroundColor:'#FFF8E7',paddingHorizontal:7,paddingVertical:2,borderRadius:8,borderWidth:0.5,borderColor:'#D4A017'}}>
                          <Text style={{color:'#B8860B',fontSize:10,fontWeight:'700'}}>🔄 {b.recurFreq}</Text>
                        </View>
                      </View>
                    )}
                    {b.assignedWorkerName?
                      <Text style={{color:C.green,fontSize:12,marginTop:4}}>👩 {b.assignedWorkerName}</Text>:
                      <Text style={{color:C.red,fontSize:12,marginTop:4}}>⚠️ Needs assignment</Text>}
                  </View>
                  <View style={{alignItems:'flex-end',gap:4}}>
                    <Text style={{color:C.muted,fontSize:10}}>{timeAgo(b.createdAt)}</Text>
                  </View>
                </View>
                {b.status?.toLowerCase()==='confirmed'&&!b.assignedWorkerId&&(
                  <TouchableOpacity style={[S.btn,{paddingVertical:10,marginTop:10}]} onPress={()=>setSelJob(b)}>
                    <Text style={[S.btnT,{fontSize:13}]}>👩 Assign Now</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
          {shown.length===0&&(
            <View style={{alignItems:'center',padding:60}}>
              <Text style={{fontSize:48}}>💭</Text>
              <Text style={{color:C.muted,marginTop:12}}>No {filter} bookings</Text>
            </View>
          )}
          <View style={{height:100}}/>
        </ScrollView>
      </View>
    );
  };

  // TEAM TAB
  const TeamTab=()=>(
    <View style={{flex:1}}>
      <View style={{padding:16,paddingBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
        <Text style={{color:C.text,fontWeight:'800',fontSize:17}}>Team ({workers.filter(w=>w.role!=='hub_manager').length})</Text>
        <TouchableOpacity style={{backgroundColor:C.blue2,paddingHorizontal:14,paddingVertical:8,borderRadius:20}}
          onPress={()=>setAddWorkerModal(true)}>
          <Text style={{color:'#FFF',fontWeight:'700',fontSize:13}}>+ Add Employee</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{flex:1,padding:16}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue}/>}>

        {/* On Job Workers */}
        {workers.filter(w=>w.role!=='hub_manager'&&!w.isAvailable&&w.status==='active').length>0&&(
          <>
            <Text style={{color:C.orange,fontWeight:'700',fontSize:13,marginBottom:10}}>⚡ Currently Working ({workers.filter(w=>w.role!=='hub_manager'&&!w.isAvailable&&w.status==='active').length})</Text>
            {workers.filter(w=>w.role!=='hub_manager'&&!w.isAvailable&&w.status==='active').map(w=>{
              const activeJob=jobs.find(j=>j.assignedWorkerId===w.id&&['on_the_way','in_progress'].includes(j.status));
              return(
                <TouchableOpacity key={w.id} style={[S.card,{marginBottom:10,borderColor:C.orangeBd,borderWidth:1}]} onPress={()=>setSelWorker(w)}>
                  <View style={{flexDirection:'row',alignItems:'center'}}>
                    <View style={{width:48,height:48,borderRadius:24,backgroundColor:C.orangeBg,alignItems:'center',justifyContent:'center',marginRight:14,borderWidth:1,borderColor:C.orangeBd}}>
                      <Text style={{color:C.orange,fontWeight:'900',fontSize:20}}>{w.name?.[0]||'?'}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{w.name}</Text>
                      <Text style={{color:C.text2,fontSize:12}}>📞 {w.phone}</Text>
                      {activeJob&&<Text style={{color:C.orange,fontSize:11,marginTop:3}}>🔧 {activeJob.serviceType||'Service'} · {activeJob.orderId||activeJob.id?.slice(-6)}</Text>}
                      {activeJob&&<Text style={{color:C.muted,fontSize:10,marginTop:1}}>{(JOB_STATUS[activeJob.status]||{}).label||activeJob.status}</Text>}
                    </View>
                    <View style={{alignItems:'flex-end',gap:4}}>
                      <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:C.orangeBg,borderWidth:0.5,borderColor:C.orangeBd}}>
                        <Text style={{color:C.orange,fontSize:9,fontWeight:'700'}}>● On Job</Text>
                      </View>
                      <Text style={{color:C.gold,fontSize:11}}>⭐ {w.ratingAvg||4.9}</Text>
                      <TouchableOpacity onPress={()=>Linking.openURL(`tel:+91${w.phone}`)}>
                        <Text style={{fontSize:18}}>📞</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Available Workers */}
        {workers.filter(w=>w.role!=='hub_manager'&&w.isAvailable&&w.status==='active').length>0&&(
          <>
            <Text style={{color:C.green,fontWeight:'700',fontSize:13,marginBottom:10,marginTop:4}}>✅ Available ({workers.filter(w=>w.role!=='hub_manager'&&w.isAvailable&&w.status==='active').length})</Text>
            {workers.filter(w=>w.role!=='hub_manager'&&w.isAvailable&&w.status==='active').map(w=>(
              <TouchableOpacity key={w.id} style={[S.card,{marginBottom:10}]} onPress={()=>setSelWorker(w)}>
                <View style={{flexDirection:'row',alignItems:'center'}}>
                  <View style={{width:48,height:48,borderRadius:24,backgroundColor:C.blueBg,alignItems:'center',justifyContent:'center',marginRight:14,borderWidth:1,borderColor:C.blueBd}}>
                    <Text style={{color:C.blue,fontWeight:'900',fontSize:20}}>{w.name?.[0]||'?'}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{w.name}</Text>
                    <Text style={{color:C.text2,fontSize:12}}>📞 {w.phone}</Text>
                    <Text style={{color:C.muted,fontSize:11,marginTop:2}}>📍 {w.currentArea||'Madhurawada'}</Text>
                  </View>
                  <View style={{alignItems:'flex-end',gap:4}}>
                    <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:C.greenBg,borderWidth:0.5,borderColor:C.greenBd}}>
                      <Text style={{color:C.green,fontSize:9,fontWeight:'700'}}>● Free</Text>
                    </View>
                    <Text style={{color:C.gold,fontSize:11}}>⭐ {w.ratingAvg||4.9}</Text>
                    <Text style={{color:C.muted,fontSize:10}}>{w.totalJobsCompleted||0} jobs</Text>
                    <TouchableOpacity onPress={()=>Linking.openURL(`tel:+91${w.phone}`)}>
                      <Text style={{fontSize:18}}>📞</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Inactive/Suspended Workers */}
        {workers.filter(w=>w.role!=='hub_manager'&&w.status!=='active').length>0&&(
          <>
            <Text style={{color:C.muted,fontWeight:'700',fontSize:13,marginBottom:10,marginTop:4}}>⏸ Inactive / Suspended</Text>
            {workers.filter(w=>w.role!=='hub_manager'&&w.status!=='active').map(w=>{
              const ws=WORKER_STATUS[w.status]||WORKER_STATUS.active;
              return(
                <TouchableOpacity key={w.id} style={[S.card,{marginBottom:10,opacity:0.6}]} onPress={()=>setSelWorker(w)}>
                  <View style={{flexDirection:'row',alignItems:'center'}}>
                    <View style={{width:48,height:48,borderRadius:24,backgroundColor:C.card2,alignItems:'center',justifyContent:'center',marginRight:14}}>
                      <Text style={{color:C.muted,fontWeight:'900',fontSize:20}}>{w.name?.[0]||'?'}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{w.name}</Text>
                      <Text style={{color:C.text2,fontSize:12}}>📞 {w.phone}</Text>
                    </View>
                    <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:ws.bg}}>
                      <Text style={{color:ws.text,fontSize:9,fontWeight:'700',textTransform:'capitalize'}}>● {w.status}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Hub Managers section */}
        {workers.filter(w=>w.role==='hub_manager').length>0&&(
          <>
            <Text style={{color:C.blue,fontWeight:'700',fontSize:13,marginBottom:10,marginTop:8}}>👔 Hub Managers ({workers.filter(w=>w.role==='hub_manager').length})</Text>
            {workers.filter(w=>w.role==='hub_manager').map(w=>(
              <TouchableOpacity key={w.id} style={[S.card,{marginBottom:10,borderColor:C.blueBd,borderWidth:1}]} onPress={()=>setSelWorker(w)}>
                <View style={{flexDirection:'row',alignItems:'center'}}>
                  <View style={{width:48,height:48,borderRadius:24,backgroundColor:C.blueBg,alignItems:'center',justifyContent:'center',marginRight:14,borderWidth:1,borderColor:C.blueBd}}>
                    <Text style={{color:C.blue,fontWeight:'900',fontSize:20}}>{w.name?.[0]||'H'}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{w.name}</Text>
                    <Text style={{color:C.text2,fontSize:12}}>📞 {w.phone}</Text>
                    <Text style={{color:C.blue,fontSize:11,marginTop:2}}>Hub Manager · {w.currentArea||'Madhurawada'}</Text>
                  </View>
                  <TouchableOpacity onPress={()=>Linking.openURL(`tel:+91${w.phone}`)}>
                    <Text style={{fontSize:18}}>📞</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {workers.length===0&&(
          <View style={{alignItems:'center',padding:60}}>
            <Text style={{fontSize:48}}>👥</Text>
            <Text style={{color:C.muted,marginTop:12,textAlign:'center'}}>No employees added yet.{'\n'}Tap "+ Add Employee" to get started.</Text>
          </View>
        )}
        <View style={{height:100}}/>
      </ScrollView>

      {/* Add Worker Modal */}
      <Modal visible={addWorkerModal} animationType="slide" presentationStyle="formSheet">
        <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
            <TouchableOpacity onPress={()=>setAddWorkerModal(false)}><Text style={{color:C.red}}>Cancel</Text></TouchableOpacity>
            <Text style={{color:C.text,fontWeight:'700'}}>Add Worker</Text>
            <TouchableOpacity onPress={addWorker}><Text style={{color:C.blue,fontWeight:'700'}}>Save</Text></TouchableOpacity>
          </View>
          <ScrollView style={{padding:16}}>
            <Text style={S.lbl}>Full Name</Text>
            <TextInput style={S.inp} placeholder="Lakshmi Devi" placeholderTextColor={C.muted}
              value={empName} onChangeText={setEmpName} color={C.text}/>
            <Text style={S.lbl}>Mobile Number</Text>
            <TextInput style={S.inp} placeholder="9876543210" placeholderTextColor={C.muted}
              keyboardType="number-pad" maxLength={10} value={empPhone} onChangeText={setEmpPhone} color={C.text}/>
            <Text style={S.lbl}>Role</Text>
            <View style={{flexDirection:'row',gap:10,marginBottom:8}}>
              {[['worker','Worker'],['hub_manager','Hub Manager']].map(([v,l])=>(
                <TouchableOpacity key={v} onPress={()=>setEmpRole(v)}
                  style={{flex:1,padding:14,borderRadius:14,alignItems:'center',
                    backgroundColor:empRole===v?C.blue2:C.card,borderWidth:1,borderColor:empRole===v?C.blue:C.border2}}>
                  <Text style={{color:empRole===v?'#FFF':C.text2,fontWeight:'700'}}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={S.lbl}>Area</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {['Madhurawada','Rushikonda','MVP Colony','Gajuwaka'].map(a=>(
                <TouchableOpacity key={a} onPress={()=>setEmpArea(a)}
                  style={{paddingHorizontal:14,paddingVertical:8,borderRadius:20,
                    backgroundColor:empArea===a?C.blue2:C.card,borderWidth:1,borderColor:empArea===a?C.blue:C.border2}}>
                  <Text style={{color:empArea===a?'#FFF':C.text2,fontSize:13}}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );

  // COMPLAINTS TAB
  const ComplaintsTab=()=>(
    <ScrollView style={{flex:1,padding:16}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue}/>}>
      <Text style={{fontSize:17,fontWeight:'800',color:C.text,marginBottom:16}}>
        🧧 Complaints ({openComplaints.length} open)
      </Text>
      {complaints.length===0&&(
        <View style={{alignItems:'center',padding:60}}>
          <Text style={{fontSize:48}}>✅</Text>
          <Text style={{color:C.green,fontSize:16,marginTop:12,fontWeight:'700'}}>No complaints</Text>
          <Text style={{color:C.muted,marginTop:4}}>All customers are happy! �udbb7</Text>
        </View>
      )}
      {complaints.map(c=>{
        const statusColors={
          open:{bg:C.redBg,text:C.red,bd:C.redBd},
          'in_progress':{bg:C.goldBg,text:C.gold,bd:C.goldBd},
          resolved:{bg:C.greenBg,text:C.green,bd:C.greenBd},
        };
        const sc=statusColors[c.status]||statusColors.open;
        return(
          <TouchableOpacity key={c.id} style={[S.card,{marginBottom:10}]}
            onPress={()=>setSelComplaint(c)}>
            <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:8}}>
              <Text style={{color:C.blue,fontWeight:'700'}}>Job: {c.jobId?.slice(-6)||'—'}</Text>
              <View style={{paddingHorizontal:8,paddingVertical:2,borderRadius:8,backgroundColor:sc.bg,borderWidth:0.5,borderColor:sc.bd}}>
                <Text style={{color:sc.text,fontSize:10,fontWeight:'700',textTransform:'capitalize'}}>{c.status}</Text>
              </View>
            </View>
            <Text style={{color:C.text,fontWeight:'600'}}>{c.customerName||'Customer'}</Text>
            <Text style={{color:C.text2,fontSize:13,marginTop:4}}>{c.issue}</Text>
            <Text style={{color:C.muted,fontSize:11,marginTop:4}}>{timeAgo(c.createdAt)}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Complaint detail modal */}
      <Modal visible={!!selComplaint} animationType="slide" presentationStyle="formSheet">
        {selComplaint&&(
          <SafeAreaView style={{flex:1,backgroundColor:C.bg}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderBottomColor:C.border}}>
              <TouchableOpacity onPress={()=>setSelComplaint(null)}><Text style={{color:C.blue}}>← Back</Text></TouchableOpacity>
              <Text style={{color:C.text,fontWeight:'700'}}>Complaint Detail</Text>
              <View style={{width:60}}/>
            </View>
            <ScrollView style={{padding:16}}>
              <View style={S.detailCard}>
                <Text style={S.detailLabel}>COMPLAINT INFO</Text>
                <Text style={{color:C.text,fontWeight:'700',fontSize:16,marginTop:8}}>{selComplaint.customerName||'Customer'}</Text>
                <Text style={{color:C.text2,fontSize:13,marginTop:4}}>Job: {selComplaint.jobId}</Text>
                <Text style={{color:C.text2,fontSize:14,marginTop:10,lineHeight:20}}>{selComplaint.issue}</Text>
                <Text style={{color:C.muted,fontSize:11,marginTop:8}}>{timeAgo(selComplaint.createdAt)}</Text>
              </View>
              {selComplaint.status!=='resolved'&&(
                <>
                  <Text style={{color:C.text2,fontWeight:'700',marginBottom:8,marginTop:16}}>Resolution</Text>
                  <TextInput style={[S.inp,{height:100,textAlignVertical:'top',marginBottom:16}]}
                    placeholder="Describe how you resolved this..." placeholderTextColor={C.muted}
                    multiline color={C.text}
                    onEndEditing={e=>e.nativeEvent.text&&resolveComplaint(selComplaint,e.nativeEvent.text)}/>
                  <TouchableOpacity style={[S.btn,{backgroundColor:C.green2}]}
                    onPress={()=>resolveComplaint(selComplaint,'Resolved by hub manager')}>
                    <Text style={S.btnT}}>✅ Mark Resolved</Text>
                  </TouchableOpacity>
                </>
              )}
              {selComplaint.resolution&&(
                <View style={[S.detailCard,{marginTop:12,borderColor:C.greenBd,borderWidth:1}]}>
                  <Text style={S.detailLabel}>RESOLUTION</Text>
                  <Text style={{color:C.green,fontSize:14,marginTop:8}}>{selComplaint.resolution}</Text>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      <View style={{height:100}}/>
    </ScrollView>
  );


  // ATTENDANCE TAB
  const AttendanceTab=()=>{
    const [selDate,setSelDate]=useState(new Date().toISOString().split('T')[0]);
    const markAttendance=async(worker,status)=>{
      const dateKey=selDate.replace(/-/g,'');
      await fbUpdate('workers',worker.id,{
        [`attendance.${dateKey}`]:status,
        [`attendance.lastUpdated`]:firestore.FieldValue.serverTimestamp(),
        'attendance.todayStatus':status,
      });
      Alert.alert('✅ Marked',`${worker.name} marked as ${status}`);
    };
    const todayStr=new Date().toDateString();
    return(
      <ScrollView style={{flex:1,padding:16}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue}/>}>
        <Text style={{fontSize:17,fontWeight:'800',color:C.text,marginBottom:8}}>📋 Attendance</Text>
        <Text style={{color:C.muted,fontSize:12,marginBottom:16}}>{todayStr}</Text>
        {workers.filter(w=>w.role!=='hub_manager').length===0&&(
          <View style={{alignItems:'center',padding:60}}>
            <Text style={{fontSize:48}}>👥</Text>
            <Text style={{color:C.muted,marginTop:12}}>No workers added yet</Text>
          </View>
        )}
        {workers.filter(w=>w.role!=='hub_manager').map(w=>{
          const todayStatus=w.attendance?.todayStatus||'Not Marked';
          const statusColor=todayStatus==='Present'?C.green:todayStatus==='Absent'?C.red:todayStatus==='Leave'?C.gold:C.muted;
          return(
            <View key={w.id} style={[S.card,{marginBottom:12}]}>
              <View style={{flexDirection:'row',alignItems:'center',marginBottom:14}}>
                <View style={{width:44,height:44,borderRadius:22,backgroundColor:C.blueBg,alignItems:'center',justifyContent:'center',marginRight:12,borderWidth:1,borderColor:C.blueBd}}>
                  <Text style={{color:C.blue,fontWeight:'900',fontSize:18}}>{w.name?.[0]||'?'}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={{color:C.text,fontWeight:'700',fontSize:15}}>{w.name}</Text>
                  <Text style={{color:C.muted,fontSize:12}}>📞 {w.phone}</Text>
                </View>
                <View style={{paddingHorizontal:10,paddingVertical:4,borderRadius:10,
                  backgroundColor:todayStatus==='Present'?C.greenBg:todayStatus==='Absent'?C.redBg:C.goldBg,
                  borderWidth:0.5,borderColor:statusColor}}>
                  <Text style={{color:statusColor,fontSize:11,fontWeight:'700'}}>{todayStatus}</Text>
                </View>
              </View>
              <View style={{flexDirection:'row',gap:8}}>
                {['Present','Absent','Leave','Half Day'].map(s=>(
                  <TouchableOpacity key={s} onPress={()=>markAttendance(w,s)}
                    style={{flex:1,padding:8,borderRadius:10,alignItems:'center',
                      backgroundColor:todayStatus===s?
                        s==='Present'?C.greenBg:s==='Absent'?C.redBg:C.goldBg
                        :C.card2,
                      borderWidth:1,
                      borderColor:todayStatus===s?statusColor:C.border2}}>
                    <Text style={{fontSize:10,fontWeight:'700',
                      color:todayStatus===s?statusColor:C.muted,textAlign:'center'}}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{flexDirection:'row',justifyContent:'space-between',marginTop:12}}>
                <Text style={{color:C.muted,fontSize:11}}>Present: {w.attendance?.daysPresent||0} days</Text>
                <Text style={{color:C.muted,fontSize:11}}>Absent: {w.attendance?.daysAbsent||0} days</Text>
                <Text style={{color:C.muted,fontSize:11}}>Leave: {w.attendance?.daysLeave||0} days</Text>
              </View>
            </View>
          );
        })}
        <View style={{height:100}}/>
      </ScrollView>
    );
  };

  // LIVE LOCATION TAB
  const LiveLocationTab=()=>{
    const locMinsAgo=(w)=>{
      if(!w.lastLocationAt) return null;
      const d=w.lastLocationAt.toDate?w.lastLocationAt.toDate():new Date(w.lastLocationAt);
      return Math.floor((Date.now()-d.getTime())/60000);
    };
    const openMaps=(w)=>{
      if(!w.lastLat||!w.lastLng){Alert.alert('No Location','Worker location not shared yet.');return;}
      const label=encodeURIComponent(w.name||'Worker');
      Linking.openURL(`geo:${w.lastLat},${w.lastLng}?q=${w.lastLat},${w.lastLng}(${label})`);
    };
    const onJobWorkers=workers.filter(w=>w.role!=='hub_manager'&&!w.isAvailable&&w.status==='active');
    const freeWorkers=workers.filter(w=>w.role!=='hub_manager'&&w.isAvailable&&w.status==='active');
    const managers=workers.filter(w=>w.role==='hub_manager');
    return(
      <ScrollView style={{flex:1,padding:16}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue}/>}>
        <Text style={{fontSize:17,fontWeight:'800',color:C.text,marginBottom:4}}>📍 Live Locations</Text>
        <Text style={{color:C.muted,fontSize:12,marginBottom:16}}>Workers ping location every 30s · Tap card to open in Maps</Text>

        {/* On Job */}
        {onJobWorkers.length>0&&(
          <>
            <Text style={{color:C.orange,fontWeight:'700',fontSize:13,marginBottom:10}}>⚡ On Job ({onJobWorkers.length})</Text>
            {onJobWorkers.map(w=>{
              const mins=locMinsAgo(w);
              const hasLoc=!!(w.lastLat&&w.lastLng);
              const activeJob=jobs.find(j=>j.assignedWorkerId===w.id&&['on_the_way','in_progress'].includes(j.status));
              return(
                <TouchableOpacity key={w.id} style={[S.card,{marginBottom:10,borderColor:C.orangeBd,borderWidth:1}]}
                  onPress={()=>openMaps(w)}>
                  <View style={{flexDirection:'row',alignItems:'center',marginBottom:10}}>
                    <View style={{width:42,height:42,borderRadius:21,backgroundColor:C.orangeBg,alignItems:'center',justifyContent:'center',marginRight:12,borderWidth:1,borderColor:C.orangeBd}}>
                      <Text style={{color:C.orange,fontWeight:'900',fontSize:17}}>{w.name?.[0]||'?'}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={{color:C.text,fontWeight:'700'}}>{w.name}</Text>
                      {activeJob&&<Text style={{color:C.orange,fontSize:11,marginTop:1}}>🔧 {activeJob.serviceType||'Service'} · {(JOB_STATUS[activeJob.status]||{}).label||activeJob.status}</Text>}
                    </View>
                    <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:C.orangeBg,borderWidth:0.5,borderColor:C.orangeBd}}>
                      <Text style={{color:C.orange,fontSize:9,fontWeight:'700'}}>● On Job</Text>
                    </View>
                  </View>
                  <View style={{backgroundColor:C.card2,borderRadius:10,padding:10,flexDirection:'row',alignItems:'center',gap:8}}>
                    <Text style={{fontSize:16}}>{hasLoc?'📍':'❓'}</Text>
                    <View style={{flex:1}}>
                      {hasLoc?(
                        <Text style={{color:C.text2,fontSize:12}}>{w.lastLat?.toFixed(5)}°N, {w.lastLng?.toFixed(5)}°E</Text>
                      ):(
                        <Text style={{color:C.muted,fontSize:12}}>Location not shared yet</Text>
                      )}
                      {mins!==null&&<Text style={{color:C.muted,fontSize:10,marginTop:2}}>Updated {mins<2?'just now':`${mins}m ago`}</Text>}
                    </View>
                    {hasLoc&&<Text style={{color:C.blue,fontSize:12,fontWeight:'700'}}>Open ›</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Free Workers */}
        {freeWorkers.length>0&&(
          <>
            <Text style={{color:C.green,fontWeight:'700',fontSize:13,marginBottom:10,marginTop:8}}>✅ Available ({freeWorkers.length})</Text>
            {freeWorkers.map(w=>{
              const mins=locMinsAgo(w);
              const hasLoc=!!(w.lastLat&&w.lastLng);
              return(
                <TouchableOpacity key={w.id} style={[S.card,{marginBottom:10}]} onPress={()=>openMaps(w)}>
                  <View style={{flexDirection:'row',alignItems:'center'}}>
                    <View style={{width:42,height:42,borderRadius:21,backgroundColor:C.greenBg,alignItems:'center',justifyContent:'center',marginRight:12,borderWidth:1,borderColor:C.greenBd}}>
                      <Text style={{color:C.green,fontWeight:'900',fontSize:17}}>{w.name?.[0]||'?'}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={{color:C.text,fontWeight:'700'}}>{w.name}</Text>
                      {hasLoc?(
                        <Text style={{color:C.muted,fontSize:11,marginTop:1}}>📍 {w.lastLat?.toFixed(5)}°N{mins!==null?` · ${mins<2?'just now':`${mins}m ago`}`:''}
                        </Text>
                      ):(
                        <Text style={{color:C.muted,fontSize:11,marginTop:1}}>📍 No location data</Text>
                      )}
                    </View>
                    <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:C.greenBg,borderWidth:0.5,borderColor:C.greenBd}}>
                      <Text style={{color:C.green,fontSize:9,fontWeight:'700'}}>● Free</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Hub Managers */}
        {managers.length>0&&(
          <>
            <Text style={{color:C.blue,fontWeight:'700',fontSize:13,marginBottom:10,marginTop:8}}>👔 Hub Managers ({managers.length})</Text>
            {managers.map(w=>{
              const mins=locMinsAgo(w);
              const hasLoc=!!(w.lastLat&&w.lastLng);
              return(
                <TouchableOpacity key={w.id} style={[S.card,{marginBottom:10,borderColor:C.blueBd,borderWidth:1}]} onPress={()=>openMaps(w)}>
                  <View style={{flexDirection:'row',alignItems:'center'}}>
                    <View style={{width:42,height:42,borderRadius:21,backgroundColor:C.blueBg,alignItems:'center',justifyContent:'center',marginRight:12,borderWidth:1,borderColor:C.blueBd}}>
                      <Text style={{color:C.blue,fontWeight:'900',fontSize:17}}>{w.name?.[0]||'H'}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={{color:C.text,fontWeight:'700'}}>{w.name}</Text>
                      {hasLoc?(
                        <Text style={{color:C.muted,fontSize:11,marginTop:1}}>📍 {w.lastLat?.toFixed(5)}°N{mins!==null?` · ${mins<2?'just now':`${mins}m ago`}`:''}</Text>
                      ):(
                        <Text style={{color:C.muted,fontSize:11,marginTop:1}}>📍 No location data</Text>
                      )}
                    </View>
                    <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:8,backgroundColor:C.blueBg,borderWidth:0.5,borderColor:C.blueBd}}>
                      <Text style={{color:C.blue,fontSize:9,fontWeight:'700'}}>Hub Mgr</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {workers.length===0&&(
          <View style={{alignItems:'center',padding:60}}>
            <Text style={{fontSize:48}}>📍</Text>
            <Text style={{color:C.muted,marginTop:12,textAlign:'center'}}>No workers added yet</Text>
          </View>
        )}
        <View style={{height:100}}/>
      </ScrollView>
    );
  };

  // PROFILE TAB
  const ProfileTab=()=>(
    <ScrollView style={{flex:1,padding:16}}>
      <View style={[S.card,{alignItems:'center',paddingVertical:28,marginBottom:16}]}>
        <View style={{width:72,height:72,borderRadius:36,backgroundColor:C.blueBg,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:C.blueBd,marginBottom:14}}>
          <Text style={{fontSize:30,fontWeight:'900',color:C.blue}}>{manager?.name?.[0]||'H'}</Text>
        </View>
        <Text style={{fontSize:22,fontWeight:'900',color:C.text}}>{manager?.name}</Text>
        <Text style={{color:C.text2,marginTop:4}}>📞 +91 {manager?.phone}</Text>
        <View style={{paddingHorizontal:12,paddingVertical:4,borderRadius:12,backgroundColor:C.blueBg,borderWidth:0.5,borderColor:C.blueBd,marginTop:12}}>
          <Text style={{color:C.blue,fontSize:12,fontWeight:'700'}}>🏠 Hub Manager · {manager?.currentArea}</Text>
        </View>
      </View>
      <View style={[S.card,{marginBottom:12}]}>
        <Text style={{color:C.text2,fontWeight:'700',marginBottom:12}}>📊 Hub Stats</Text>
        {[
          {label:'Total Jobs Managed',val:jobs.length,color:C.blue},

          {label:'Workers in Team',val:workers.filter(w=>w.role!=='hub_manager').length,color:C.green},
          {label:'Complaints Open',val:openComplaints.length,color:openComplaints.length>0?C.red:C.green},
        ].map((item,i)=>(
          <View key={i} style={{flexDirection:'row',justifyContent:'space-between',marginBottom:10}}>
            <Text style={{color:C.muted,fontSize:13}}>{item.label}</Text>
            <Text style={{color:item.color,fontWeight:'700'}}>{item.val}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={[S.card,{flexDirection:'row',alignItems:'center',gap:12}]}
        onPress={()=>Alert.alert('Logout','Sign out?',[
          {text:'Cancel',style:'cancel'},
          {text:'Logout',style:'destructive',onPress:()=>{auth().signOut();setManager(null);setJobs([]);setWorkers([]);setScreen('login');setTab('dashboard');}},
        ])}>
        <Text style={{fontSize:20}}>🚪</Text>
        <Text style={{color:C.red,fontWeight:'700',fontSize:15}}>Logout</Text>
      </TouchableOpacity>
      <View style={{height:100}}/>
    </ScrollView>
  );

  // TABS
  const TABS=[
    {id:'dashboard',  icon:'🏠',label:'Home',      badge:0},
    {id:'bookings',   icon:'📦',label:'Bookings',  badge:unassigned.length},
    {id:'team',       icon:'👥',label:'Team',       badge:0},
    {id:'livemap',    icon:'📍',label:'Live',       badge:0},
    {id:'attendance', icon:'📋',label:'Attend',    badge:0},
    {id:'complaints', icon:'🧧',label:'Issues',     badge:openComplaints.length},
    {id:'profile',    icon:'👤',label:'Profile',    badge:0},
  ];

  return(
    <View style={{flex:1,backgroundColor:C.bg}}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <SafeAreaView style={{flex:1}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingVertical:10,borderBottomWidth:0.5,borderBottomColor:C.border}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
            <Text style={{fontSize:16}}>�udbb7</Text>
            <Text style={{fontSize:15,fontWeight:'900',color:C.blue,letterSpacing:2}}>VEGA</Text>
            <View style={{backgroundColor:C.blueBg,paddingHorizontal:8,paddingVertical:2,borderRadius:8,borderWidth:0.5,borderColor:C.blueBd}}>
              <Text style={{color:C.blue,fontSize:9,fontWeight:'700',letterSpacing:1}}>HUB MGR</Text>
            </View>
          </View>
          <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
            {(unassigned.length+openComplaints.length)>0&&(
              <View style={{backgroundColor:C.red,width:20,height:20,borderRadius:10,alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'#FFF',fontSize:10,fontWeight:'900'}}>{unassigned.length+openComplaints.length}</Text>
              </View>
            )}
            <Text style={{color:C.text2,fontSize:13}}>{manager?.name?.split(' ')[0]}</Text>
          </View>
        </View>
        <View style={{flex:1}}>
          {tab==='dashboard'  &&<DashboardTab/>}
          {tab==='bookings'   &&<BookingsTab/>}
          {tab==='team'       &&<TeamTab/>}
          {tab==='livemap'    &&<LiveLocationTab/>}
          {tab==='attendance' &&<AttendanceTab/>}
          {tab==='complaints' &&<ComplaintsTab/>}
          {tab==='profile'    &&<ProfileTab/>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{maxHeight:62,borderTopWidth:0.5,borderTopColor:C.border,backgroundColor:C.card}}
          contentContainerStyle={{flexDirection:'row',paddingBottom:Platform.OS==='ios'?18:6,paddingTop:8,paddingHorizontal:4}}>
          {TABS.map(t=>(
            <TouchableOpacity key={t.id} style={{paddingHorizontal:12,alignItems:'center',gap:2}} onPress={()=>setTab(t.id)}>
              <View style={{position:'relative'}}>
                <Text style={{fontSize:tab===t.id?22:18}}>{t.icon}</Text>
                {t.badge>0&&(
                  <View style={{position:'absolute',top:-4,right:-8,backgroundColor:C.red,width:16,height:16,borderRadius:8,alignItems:'center',justifyContent:'center'}}>
                    <Text style={{color:'#FFF',fontSize:9,fontWeight:'900'}}>{t.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={{fontSize:9,fontWeight:tab===t.id?'800':'500',color:tab===t.id?C.blue:C.muted}}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
      <JobDetailModal/>
      <WorkerDetailModal/>
    </View>
  );
}

const S=StyleSheet.create({
  lbl:{color:'#4A5580',fontSize:12,fontWeight:'600',marginBottom:8,marginTop:14},
  inp:{backgroundColor:'#0A1020',borderWidth:0.5,borderColor:'#1A2240',borderRadius:14,padding:14,fontSize:15},
  phoneRow:{flexDirection:'row',backgroundColor:'#0A1020',borderWidth:0.5,borderColor:'#1A2240',borderRadius:14,overflow:'hidden'},
  flag:{padding:14,fontSize:13,fontWeight:'700',color:'#EDF0F8',backgroundColor:'#0E1428',borderRightWidth:0.5,borderRightColor:'#1A2240'},
  phoneInp:{flex:1,padding:14,fontSize:15,letterSpacing:2},
  btn:{backgroundColor:'#E8520A',borderRadius:30,padding:15,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:8},
  btnT:{color:'#FFF',fontSize:14,fontWeight:'800'},
  card:{backgroundColor:'#0A1020',borderRadius:18,padding:16,borderWidth:0.5,borderColor:'#1A2240'},
  detailCard:{backgroundColor:'#0A1020',borderRadius:18,padding:16,borderWidth:0.5,borderColor:'#1A2240',marginBottom:12},
  detailLabel:{color:'#4A5580',fontSize:10,fontWeight:'700',letterSpacing:1.5},
});
