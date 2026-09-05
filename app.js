/**
 * NeuroGaze Lab - 心理学眼动追踪实验系统 (6大几何范式与多维评估版)
 * 包含：
 * 1. 任务 1: ↔️ 从左到右 (水平平滑眼动追随)
 * 2. 任务 2: ↕️ 从上到下 (垂直平滑眼动追随)
 * 3. 任务 3: ⭕ 画圆 (连续非线性曲率平滑追随)
 * 4. 任务 4: ⏹️ 画方 (90°直角扫视与顶点定位)
 * 5. 任务 5: ⭐ 画五角星 (交叉折线与复杂视空间跳跃)
 * 6. 任务 6: ♾️ 画不规则图形 (心理学复合变频连续曲线)
 * 核心评估系统：
 * - 空间轨迹贴合度 (RMSE 均方根误差、匹配评分 0-100分、覆盖率)
 * - 时间与运动学分析 (任务耗时、平均追踪角速度/线速度)
 * - 6大任务轨迹叠合小图看板与科研级 CSV / JSON 完整导出
 */

(function () {
    'use strict';

    // ==========================================
    // 1. 全局配置与状态
    // ==========================================
    const CONFIG = {
        screenDistanceCm: 60,
        screenDiagonalIn: 15.6,
        calibSamplesPerPoint: 8,
        calibSampleIntervalMs: 70,
        gazeStaleMs: 250,
        sampleIntervalMs: 50,
        researchTargetSpeedPxS: 115,
        validationSettleMs: 650,
        validationCollectMs: 900,
        validationSampleMs: 50
    };

    // 6大几何眼动范式定义
    const TASKS = {
        lr: {
            id: 'lr',
            index: 1,
            name: '从左到右',
            fullName: '1. 从左到右 (水平平滑追随)',
            icon: '↔️',
            desc: '水平平滑眼动追随与横向扫视 (Horizontal Pursuit)',
            psychology: '水平平滑追随：同步误差、追随延迟与有效采样率',
            tip: '保持头部稳定，只注视沿水平方向匀速移动的目标球。',
            closed: false,
            getPathPoint(t, W, H) {
                const cy = H / 2;
                const x0 = W * 0.12;
                const x1 = W * 0.88;
                return { x: x0 + t * (x1 - x0), y: cy };
            }
        },
        tb: {
            id: 'tb',
            index: 2,
            name: '从上到下',
            fullName: '2. 从上到下 (垂直平滑追随)',
            icon: '↕️',
            desc: '垂直平滑眼动追随与上下扫视 (Vertical Pursuit)',
            psychology: '垂直平滑追随：同步误差、追随延迟与有效采样率',
            tip: '保持头部稳定，只注视沿垂直方向匀速移动的目标球。',
            closed: false,
            getPathPoint(t, W, H) {
                const cx = W / 2;
                const y0 = H * 0.14;
                const y1 = H * 0.86;
                return { x: cx, y: y0 + t * (y1 - y0) };
            }
        },
        circle: {
            id: 'circle',
            index: 3,
            name: '画圆',
            fullName: '3. 画圆 (连续非线性曲率追踪)',
            icon: '⭕',
            desc: '连续360°旋转平滑追随 (Circular Tracing)',
            psychology: '二维平滑追随：连续曲率条件下的同步误差与覆盖',
            tip: '持续注视顺时针匀速运动的目标球，不要预测或追看红色视线点。',
            closed: true,
            getPathPoint(t, W, H) {
                const cx = W / 2;
                const cy = H / 2;
                const R = Math.min(W, H) * 0.35;
                const angle = -Math.PI / 2 + t * (Math.PI * 2);
                return {
                    x: cx + R * Math.cos(angle),
                    y: cy + R * Math.sin(angle)
                };
            }
        },
        square: {
            id: 'square',
            index: 4,
            name: '画方',
            fullName: '4. 画方 (折线路径追随)',
            icon: '⏹️',
            desc: '90°方向转换与目标再捕获 (Square Pursuit)',
            psychology: '折线路径追随：方向转换后的再捕获误差（非标准扫视范式）',
            tip: '持续注视沿矩形边运动的目标球，拐角处继续跟随。',
            closed: true,
            getPathPoint(t, W, H) {
                const cx = W / 2;
                const cy = H / 2;
                const S = Math.min(W, H) * 0.32;
                const corners = [
                    { x: cx - S, y: cy - S }, // 顶点0: 左上
                    { x: cx + S, y: cy - S }, // 顶点1: 右上
                    { x: cx + S, y: cy + S }, // 顶点2: 右下
                    { x: cx - S, y: cy + S }, // 顶点3: 左下
                    { x: cx - S, y: cy - S }  // 闭合至左上
                ];
                const seg = Math.min(3, Math.floor(t * 4));
                const subT = (t * 4) - seg;
                const p0 = corners[seg];
                const p1 = corners[seg + 1];
                return {
                    x: p0.x + subT * (p1.x - p0.x),
                    y: p0.y + subT * (p1.y - p0.y)
                };
            }
        },
        star: {
            id: 'star',
            index: 5,
            name: '画五角星',
            fullName: '5. 画五角星 (复杂折线路径追随)',
            icon: '⭐',
            desc: '多角度方向转换与目标再捕获 (5-Point Star Pursuit)',
            psychology: '复杂折线路径追随：多次方向转换后的再捕获表现',
            tip: '持续注视沿五角星折线运动的目标球，避免提前看向下一顶点。',
            closed: true,
            getPathPoint(t, W, H) {
                const cx = W / 2;
                const cy = H / 2;
                const R = Math.min(W, H) * 0.36;
                const v = [];
                for (let k = 0; k < 5; k++) {
                    const a = -Math.PI / 2 + k * (2 * Math.PI / 5);
                    v.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
                }
                const order = [0, 2, 4, 1, 3, 0];
                const seg = Math.min(4, Math.floor(t * 5));
                const subT = (t * 5) - seg;
                const p0 = v[order[seg]];
                const p1 = v[order[seg + 1]];
                return {
                    x: p0.x + subT * (p1.x - p0.x),
                    y: p0.y + subT * (p1.y - p0.y)
                };
            }
        },
        irregular: {
            id: 'irregular',
            index: 6,
            name: '画不规则图形',
            fullName: '6. 画不规则图形 (心理学复合变频曲线)',
            icon: '♾️',
            desc: '变频复合多阶曲率连续调控 (Complex Spline / Harmonic Curve)',
            psychology: '复杂曲率追随：二维同步误差、延迟与轨迹覆盖',
            tip: '持续注视沿复合曲线匀速运动的目标球。',
            closed: true,
            getPathPoint(t, W, H) {
                const cx = W / 2;
                const cy = H / 2;
                const Rx = Math.min(W, H) * 0.36;
                const Ry = Math.min(W, H) * 0.27;
                const th = t * Math.PI * 2;
                return {
                    x: cx + Rx * (Math.sin(th) + 0.35 * Math.sin(2 * th)),
                    y: cy - Ry * (Math.cos(th) - 0.30 * Math.cos(2 * th) + 0.15 * Math.sin(th)) + (Ry * 0.12)
                };
            }
        }
    };

    const TASK_KEYS = ['lr', 'tb', 'circle', 'square', 'star', 'irregular'];

    const state = {
        currentStage: 'intro',
        isWebgazerReady: false,
        isSimulated: false,
        faceLocked: false,
        controlMode: 'research',  // research 为正式评估；guidance/direct 仅供互动练习

        // 灵敏度增益乘数 (1.0x ~ 5.0x，黄金校准默认 2.8x)
        sensitivityGain: 2.8,
        // 独立水平左右范围增益倍率 (1.0x ~ 4.0x，默认 2.2x，轻松触达左右边界)
        horizontalGainRatio: 2.2,
        // 独立垂直增益倍率 (0.8x ~ 3.0x，黄金校准默认 1.4x)
        verticalGainRatio: 1.4,
        // 滤波平滑度等级 (1=极速响应, 3=平衡推荐, 5=超强防抖)
        smoothLevel: 3,
        // 特征域低通平滑器 (消除特征源头微动与CMOS噪点)
        featureFilter: { devX: 0, devY: 0, initialized: false },
        // 监控视窗显示状态
        isCamMonitorHidden: false,
        showGazeDot: true,

        // 几何基准点与当前相机视线度量
        baselineCameraX: null,
        baselineCameraY: null,
        currentCameraGazeX: 0,
        currentCameraGazeY: 0,
        isBaselineCalibrated: false,
        baselineWarmupSamples: [],
        recentCameraSamples: [], // 最近若干帧采样缓存，用于按空格键时进行稳健多帧均值校准

        // 屏幕绝对坐标
        rawGaze: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        smoothGaze: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        webgazerGaze: null,
        webgazerSampleAt: 0,
        recentWebgazerPredictions: [],
        screenCorrection: { x: 0, y: 0 },
        gazeValid: false,
        filterBuffer: [],
        filterLastAt: 0,
        lastProcessedPredictionAt: 0,
        lastRecordedAt: 0,
        lastRecordedPredictionAt: 0,
        faceQuality: { centered: false, eyesOpen: false },

        // 当前实验任务状态
        currentTaskId: 'lr',
        taskActive: false,
        taskStartTime: 0,
        taskProgress: 0,        // 0.0 ~ 1.0
        taskDensePoints: [],    // 预采样的目标路径点
        taskTotalLength: 1,     // 路径总弧长
        taskUserTrail: [],      // 当前任务的视线时序点
        taskLiveScore: 100,
        taskLastFrameAt: 0,
        taskRunId: 0,

        // 6大任务完成数据存储 (taskId -> metrics)
        completedTasks: {},

        // 标定统计
        calibProgress: {},
        totalCalibCompleted: 0,
        totalCalibSamples: 0,

        // 精度自测
        validationDegError: 0,
        validationResults: null,
        calibrationComplete: false,
        calibrationBusy: false,
        calibrationOrderIndex: 0,

        // 全量数据流 (用于导出)
        allSessionSamples: [],

        // 帧率与辅导节流
        fpsCounter: 0,
        fpsTimer: performance.now(),
        currentFPS: 0,
        coachTimer: 0
    };

    // ==========================================
    // 2. DOM 元素缓存
    // ==========================================
    const DOM = {
        stages: {
            intro: document.getElementById('stage-intro'),
            calibration: document.getElementById('stage-calibration'),
            validation: document.getElementById('stage-validation'),
            experiment: document.getElementById('stage-experiment'),
            results: document.getElementById('stage-results')
        },

        // 状态指示
        eyeLockDot: document.getElementById('eye-lock-dot'),
        eyeLockText: document.getElementById('eye-lock-text'),
        gazeCoordsText: document.getElementById('gaze-coords-text'),
        gazeDirBadge: document.getElementById('gaze-dir-badge'),
        fpsDisplay: document.getElementById('fps-display'),
        gazeCorrectionText: document.getElementById('gaze-correction-text'),
        controlModeSelect: document.getElementById('control-mode-select'),
        diagMsg: document.getElementById('diag-msg'),
        monitorBoxStatus: document.getElementById('monitor-box-status'),
        monitorCoachTip: document.getElementById('monitor-coach-tip'),
        gainSlider: document.getElementById('gain-slider'),
        gainVal: document.getElementById('gain-val'),
        gainXSlider: document.getElementById('gain-x-slider'),
        gainXVal: document.getElementById('gain-x-val'),
        gainYSlider: document.getElementById('gain-y-slider'),
        gainYVal: document.getElementById('gain-y-val'),
        smoothSlider: document.getElementById('smooth-slider'),
        smoothVal: document.getElementById('smooth-val'),
        btnRecenterZero: document.getElementById('btn-recenter-zero'),
        btnClearDrift: document.getElementById('btn-clear-drift'),
        camMonitorWidget: document.getElementById('cam-monitor-widget'),
        btnToggleCamMonitor: document.getElementById('btn-toggle-cam-monitor'),
        btnReopenCamMonitor: document.getElementById('btn-reopen-cam-monitor'),
        btnToggleCamTop: document.getElementById('btn-toggle-cam-top'),

        // 导航与阶段按钮
        btnQuickPlay: document.getElementById('btn-quick-play'),
        btnStartInit: document.getElementById('btn-start-init'),
        btnUseSimulated: document.getElementById('btn-use-simulated'),
        btnStartValidation: document.getElementById('btn-start-validation'),
        btnSkipToExp: document.getElementById('btn-skip-to-exp'),
        btnRecalibNow: document.getElementById('btn-recalib-now'),
        btnSkipCalibDirect: document.getElementById('btn-skip-calib-direct'),

        // 标定
        calibPoints: document.querySelectorAll('.calib-point'),
        calibProgressFill: document.getElementById('calib-progress-fill'),
        calibCountText: document.getElementById('calib-count-text'),
        calibSamplesText: document.getElementById('calib-samples-text'),

        // 验证
        valDegVal: document.getElementById('validation-deg-val'),
        valAssessment: document.getElementById('validation-assessment'),
        valMeterCircle: document.getElementById('val-meter-circle'),
        valMedian: document.getElementById('validation-median'),
        valPrecision: document.getElementById('validation-precision'),
        valValidRate: document.getElementById('validation-valid-rate'),
        viewDistanceCm: document.getElementById('view-distance-cm'),
        screenDiagonalIn: document.getElementById('screen-diagonal-in'),

        // 实验 HUD 与任务导航
        tasksNavBar: document.getElementById('tasks-nav-bar'),
        taskTabBtns: document.querySelectorAll('.task-tab-btn'),
        hudTaskName: document.getElementById('hud-task-name'),
        hudProgressBar: document.getElementById('hud-task-progress-bar'),
        hudProgressText: document.getElementById('hud-progress-text'),
        hudTimer: document.getElementById('hud-timer'),
        hudLiveScore: document.getElementById('hud-live-score'),
        btnToggleDot: document.getElementById('btn-toggle-dot'),
        btnResetTask: document.getElementById('btn-reset-task'),
        btnNextTask: document.getElementById('btn-next-task'),
        btnFinishAllTasks: document.getElementById('btn-finish-all-tasks'),
        expTipsText: document.getElementById('exp-tips-text'),

        // 实验舞台与画布
        arena: document.getElementById('multi-shape-arena'),
        targetCanvas: document.getElementById('target-canvas'),
        trailCanvas: document.getElementById('trail-canvas'),
        tractionCanvas: document.getElementById('traction-canvas'),
        ball: document.getElementById('gaze-ball'),
        liveCursor: document.getElementById('live-gaze-cursor'),

        // 单任务完成弹窗
        taskSuccessBanner: document.getElementById('task-success-banner'),
        taskSuccessTitle: document.getElementById('task-success-title'),
        taskResTime: document.getElementById('task-res-time'),
        taskResScore: document.getElementById('task-res-score'),
        taskResRmse: document.getElementById('task-res-rmse'),
        btnProceedNext: document.getElementById('btn-proceed-next'),
        btnReplayTask: document.getElementById('btn-replay-task'),
        btnViewSummary: document.getElementById('btn-view-summary'),

        // 阶段 5 结算看板
        resOverallScore: document.getElementById('res-overall-score'),
        resTotalTime: document.getElementById('res-total-time'),
        resAvgDegError: document.getElementById('res-avg-deg-error'),
        resTotalSamples: document.getElementById('res-total-samples'),
        sessionQualityNote: document.getElementById('session-quality-note'),
        taskCardsGrid: document.getElementById('task-cards-grid'),
        analysisTableBody: document.getElementById('analysis-table-body'),
        btnExportCsv: document.getElementById('btn-export-csv'),
        btnExportJson: document.getElementById('btn-export-json'),
        btnRestartAll: document.getElementById('btn-restart-all')
    };

    // ==========================================
    // 3. 监控视窗智能折叠与隐藏管理
    // ==========================================
    function hideCameraMonitor(isAuto = false) {
        if (DOM.camMonitorWidget) {
            DOM.camMonitorWidget.classList.add('hidden-monitor');
        }
        if (DOM.btnReopenCamMonitor) {
            DOM.btnReopenCamMonitor.style.display = 'flex';
        }
        if (DOM.btnToggleCamTop) {
            DOM.btnToggleCamTop.textContent = '📷 展开监控';
        }
        if (!isAuto) {
            state.isCamMonitorHidden = true;
        }
    }

    function showCameraMonitor() {
        if (DOM.camMonitorWidget) {
            DOM.camMonitorWidget.classList.remove('hidden-monitor');
        }
        if (DOM.btnReopenCamMonitor) {
            DOM.btnReopenCamMonitor.style.display = 'none';
        }
        if (DOM.btnToggleCamTop) {
            DOM.btnToggleCamTop.textContent = '📷 隐藏监控';
        }
        state.isCamMonitorHidden = false;
    }

    function toggleCameraMonitor() {
        if (DOM.camMonitorWidget && DOM.camMonitorWidget.classList.contains('hidden-monitor')) {
            showCameraMonitor();
        } else {
            hideCameraMonitor(false);
        }
    }

    // ==========================================
    // 3.1 阶段路由管理
    // ==========================================
    function switchStage(newStage) {
        Object.keys(DOM.stages).forEach(s => {
            if (DOM.stages[s]) DOM.stages[s].classList.remove('active');
        });
        if (DOM.stages[newStage]) {
            DOM.stages[newStage].classList.add('active');
            state.currentStage = newStage;
        }

        // 九点校准阶段：自动隐藏右上角监控视窗，彻底消除对 3 号标定点的遮挡
        if (newStage === 'calibration') {
            hideCameraMonitor(true);
        } else if (newStage === 'experiment') {
            initTaskArena();
            loadTask(state.currentTaskId);
            if (!state.isCamMonitorHidden) {
                showCameraMonitor();
            }
        } else if (newStage === 'results') {
            renderResultsDashboard();
        } else if (!state.isCamMonitorHidden) {
            showCameraMonitor();
        }
    }

    // ==========================================
    // 4. WebGazer 初始化与防污染净化
    // ==========================================
    async function initEyeTracking() {
        if (state.isWebgazerReady) return;

        DOM.diagMsg.textContent = '正在启动摄像头并加载本地离线 AI 模型，请在浏览器中允许摄像头权限...';
        DOM.eyeLockText.textContent = '连接摄像头中...';
        DOM.eyeLockDot.className = 'dot yellow';

        if (typeof webgazer === 'undefined') {
            alert('未检测到 webgazer.js 离线引擎，已自动切换为【鼠标模拟视线模式】。');
            enableSimulatedGaze();
            switchStage('experiment');
            return;
        }

        try {
            // 彻底切断鼠标监听与 IndexedDB 历史毒化数据
            if (webgazer.removeMouseEventListeners) {
                webgazer.removeMouseEventListeners();
            }
            if (webgazer.saveDataAcrossSessions) {
                webgazer.saveDataAcrossSessions(false);
            }
            if (webgazer.params) {
                webgazer.params.saveDataAcrossSessions = false;
                webgazer.params.showVideoPreview = true;
                webgazer.params.showFaceOverlay = true;
                webgazer.params.showFaceFeedbackBox = true;
                webgazer.params.showPredictionPoints = false;
                webgazer.params.showGazeDot = false;
            }
            if (webgazer.clearData) {
                try { await webgazer.clearData(); } catch(e) {}
            }
            try {
                if (window.indexedDB && window.indexedDB.deleteDatabase) {
                    window.indexedDB.deleteDatabase('localforage');
                }
            } catch(e) {}

            await webgazer.setRegression('ridge')
                .setGazeListener(onGazeSample)
                .begin();

            if (webgazer.applyKalmanFilter) webgazer.applyKalmanFilter(false);

            if (webgazer.removeMouseEventListeners) {
                webgazer.removeMouseEventListeners();
            }

            ensureCameraFeedMounted();

            state.isWebgazerReady = true;
            DOM.eyeLockText.textContent = '已连接，定位中';
            DOM.eyeLockDot.className = 'dot yellow';
            DOM.diagMsg.textContent = '摄像头已就绪！平视屏幕按一次【空格键】，光标瞬间定在中心！';

            requestAnimationFrame(trackerFrameLoop);

        } catch (err) {
            console.error('摄像头启动异常:', err);
            alert('未能启动摄像头（可能被其他程序占用或权限受限）。\n已自动为您切换为【鼠标模拟视线模式】，您可立即体验所有6大几何实验！');
            enableSimulatedGaze();
            switchStage('experiment');
        }
    }

    function ensureCameraFeedMounted() {
        const wrapper = document.getElementById('webgazer-container-wrapper');
        const defaultContainer = document.getElementById('webgazerVideoContainer');

        if (defaultContainer && wrapper && defaultContainer.parentElement !== wrapper) {
            wrapper.appendChild(defaultContainer);
            defaultContainer.style.position = 'relative';
            defaultContainer.style.top = '0px';
            defaultContainer.style.left = '0px';
            defaultContainer.style.width = '280px';
            defaultContainer.style.height = '210px';
        }
    }

    function enableSimulatedGaze() {
        state.isSimulated = true;
        state.gazeValid = true;
        DOM.eyeLockText.textContent = '鼠标模拟模式';
        DOM.eyeLockDot.className = 'dot green';
        DOM.monitorBoxStatus.textContent = '🟢 模拟模式';
        DOM.monitorCoachTip.textContent = '💡 移动鼠标即可实时模拟视线全向移动';

        window.addEventListener('mousemove', (e) => {
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            state.smoothGaze.x = e.clientX;
            state.smoothGaze.y = e.clientY;
            state.rawGaze.x = e.clientX;
            state.rawGaze.y = e.clientY;
            DOM.gazeCoordsText.textContent = `(${Math.round(e.clientX)}, ${Math.round(e.clientY)})`;

            let cx = screenW / 2;
            let cy = screenH / 2;
            if (state.currentStage === 'experiment' && DOM.arena) {
                const rect = DOM.arena.getBoundingClientRect();
                if (rect.width > 50) {
                    cx = rect.left + rect.width / 2;
                    cy = rect.top + rect.height / 2;
                }
            }

            const deltaX = (e.clientX - cx) / (screenW / 2);
            const deltaY = (e.clientY - cy) / (screenH / 2);
            updateDirectionBadge(deltaX, deltaY);

            if (state.showGazeDot) {
                DOM.liveCursor.style.display = 'block';
                DOM.liveCursor.style.left = `${e.clientX}px`;
                DOM.liveCursor.style.top = `${e.clientY}px`;
            }
        });
    }

    // ==========================================
    // 5. 核心眼动算法：瞳孔暗质心与面部姿态几何解算
    // ==========================================
    let eyeCropCanvas = null;
    let eyeCropCtx = null;

    /**
     * 高精度眼裂解算器：根据 FaceMesh 真实多点眼睑与内外眼角坐标，
     * 锁定纯净眼裂区域并从实时画面精准裁切，彻底剔除眉毛、额头与面颊阴影！
     */
    function getEyePupilFromVideo(videoSource, pOuter, pInner, upperPoints, lowerPoints) {
        if (!videoSource) return null;
        const isCanvas = (typeof HTMLCanvasElement !== 'undefined') && (videoSource instanceof HTMLCanvasElement);
        const isVideo = (typeof HTMLVideoElement !== 'undefined') && (videoSource instanceof HTMLVideoElement);
        if (isVideo && (videoSource.readyState < 2 || !videoSource.videoWidth)) return null;
        if (isCanvas && (!videoSource.width || !videoSource.height)) return null;

        const srcW = isVideo ? videoSource.videoWidth : videoSource.width;
        const srcH = isVideo ? videoSource.videoHeight : videoSource.height;

        const xMin = Math.min(pOuter[0], pInner[0]);
        const xMax = Math.max(pOuter[0], pInner[0]);

        let sumUp = 0; upperPoints.forEach(p => sumUp += p[1]);
        const avgUp = sumUp / upperPoints.length;

        let sumLow = 0; lowerPoints.forEach(p => sumLow += p[1]);
        const avgLow = sumLow / lowerPoints.length;

        const yMin = Math.min(avgUp, avgLow);
        const yMax = Math.max(avgUp, avgLow);

        const rawW = xMax - xMin;
        const rawH = yMax - yMin;
        if (rawW < 8 || rawH < 3) return null;

        // 紧凑贴合眼裂，严密避开眉毛、额头阴影与面颊高光
        const cropX = Math.max(0, Math.round(xMin - rawW * 0.06));
        const cropY = Math.max(0, Math.round(yMin - rawH * 0.12));
        const cropW = Math.min(srcW - cropX, Math.round(rawW * 1.12));
        const cropH = Math.min(srcH - cropY, Math.round(rawH * 1.24));
        if (cropW < 6 || cropH < 4) return null;

        if (!eyeCropCanvas) {
            eyeCropCanvas = document.createElement('canvas');
            eyeCropCtx = eyeCropCanvas.getContext('2d', { willReadFrequently: true });
        }
        eyeCropCanvas.width = cropW;
        eyeCropCanvas.height = cropH;

        try {
            eyeCropCtx.drawImage(videoSource, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            const imgData = eyeCropCtx.getImageData(0, 0, cropW, cropH);
            return extractDualCuePupil(imgData);
        } catch (err) {
            return null;
        }
    }

    /**
     * 高精度多特征眼裂瞳孔追踪算法：
     * 1. 水平列积分扫描定位瞳孔/虹膜主走廊 (消除两侧眼角皮褶阴影)
     * 2. 特征 A: 瞳孔暗质心在垂直走廊内的归一化高度 (向上看时暗质心上浮)
     * 3. 特征 B: 上下半区巩膜反差比 (向上看时下半部露出明亮巩膜眼白，反差极大)
     * 4. 特征 C: 虹膜下边缘垂直正梯度跃迁点 (暗虹膜到亮巩膜的最强光学边界)
     * 结合向上看生理微缩加速，纯转眼球即可敏捷向上移动，彻底消除抬头依赖！
     */
    function extractDualCuePupil(patch) {
        if (!patch || !patch.data || patch.width < 4 || patch.height < 4) return null;
        const data = patch.data;
        const w = patch.width;
        const h = patch.height;

        const grays = new Uint8Array(w * h);
        let minG = 255, maxG = 0;
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            const g = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
            grays[p] = g;
            if (g < minG) minG = g;
            if (g > maxG) maxG = g;
        }

        const range = maxG - minG;
        if (range < 12) return { x: 0.5, y: 0.5, devX: 0, devY: 0 };

        // 1. 水平扫描计算暗度列积分，精准锁定瞳孔中心列
        const colDarkness = new Float32Array(w);
        const darkThresh = minG + Math.min(30, range * 0.32);

        for (let x = 0; x < w; x++) {
            let colSum = 0;
            for (let y = 1; y < h - 1; y++) {
                const g = grays[y * w + x];
                if (g <= darkThresh) {
                    colSum += (darkThresh - g) + 1;
                }
            }
            colDarkness[x] = colSum;
        }

        let maxWinVal = -1;
        let bestX = w / 2;
        const halfWin = Math.max(2, Math.round(w * 0.09));
        const startX = Math.max(halfWin, Math.round(w * 0.15));
        const endX = Math.min(w - halfWin - 1, Math.round(w * 0.85));

        for (let x = startX; x <= endX; x++) {
            let winSum = 0;
            for (let dx = -halfWin; dx <= halfWin; dx++) {
                winSum += colDarkness[x + dx];
            }
            if (winSum > maxWinVal) {
                maxWinVal = winSum;
                bestX = x;
            }
        }

        // 亚像素加权质心解算 (Center-of-Mass Centroid)：消除离散整数列跳变，输出平滑浮点坐标
        let subpixelX = bestX;
        let cWeightSum = 0;
        let cMomentSum = 0;
        const subWin = Math.max(2, halfWin);
        for (let dx = -subWin; dx <= subWin; dx++) {
            const xi = Math.round(bestX) + dx;
            if (xi >= 0 && xi < w) {
                const weight = colDarkness[xi] * colDarkness[xi];
                cWeightSum += weight;
                cMomentSum += xi * weight;
            }
        }
        if (cWeightSum > 0) {
            subpixelX = cMomentSum / cWeightSum;
        }

        // 2. 在瞳孔垂直走廊 [subpixelX - halfWin, subpixelX + halfWin] 内提取三大互补特征
        let topBright = 0, botBright = 0;
        let darkYSum = 0, totalDarkW = 0;
        const midY = h * 0.50;
        const colProfile = new Float32Array(h);
        const centerCol = Math.round(subpixelX);

        for (let y = 0; y < h; y++) {
            let rowSum = 0, rowCount = 0;
            const row = y * w;
            for (let dx = -halfWin; dx <= halfWin; dx++) {
                const x = centerCol + dx;
                if (x < 0 || x >= w) continue;
                const g = grays[row + x];
                rowSum += g;
                rowCount++;

                if (y < midY) topBright += g;
                else botBright += g;

                if (g <= darkThresh) {
                    const wgt = (darkThresh - g) + 1;
                    darkYSum += y * wgt;
                    totalDarkW += wgt;
                }
            }
            colProfile[y] = rowCount > 0 ? (rowSum / rowCount) : 128;
        }

        // 特征 A: 瞳孔暗质心垂直相对位移 (-0.5 ~ +0.5)
        const normPupilY = (totalDarkW > 0) ? (darkYSum / totalDarkW) / h : 0.5;
        const devDarkY = normPupilY - 0.5;

        // 特征 B: 下半眼白 vs 上半眼白反差比 (向上看时显著为正)
        const cRatio = (botBright - topBright) / (botBright + topBright + 1.0);

        // 特征 C: 虹膜下边缘垂直正梯度跳变点 (暗虹膜到亮巩膜的跃迁)
        let maxGrad = -1, bestGradY = midY;
        for (let y = 2; y < h - 2; y++) {
            const grad = colProfile[y + 1] - colProfile[y];
            if (grad > maxGrad) {
                maxGrad = grad;
                bestGradY = y;
            }
        }
        let subGradY = bestGradY;
        if (bestGradY > 2 && bestGradY < h - 3) {
            const g0 = colProfile[bestGradY] - colProfile[bestGradY - 1];
            const g1 = colProfile[bestGradY + 1] - colProfile[bestGradY];
            const g2 = colProfile[bestGradY + 2] - colProfile[bestGradY + 1];
            const denom = 2 * (2 * g1 - g0 - g2);
            if (Math.abs(denom) > 1e-4) {
                subGradY = bestGradY + (g0 - g2) / denom;
            }
        }
        const devGrad = (subGradY / h) - 0.55;

        // 3. 多特征正交同相增强融合 (亚像素浮点输出)
        const pupilDevX = (subpixelX / w) - 0.5;
        // 垂直位移：暗质心 + 巩膜对比度 + 虹膜下缘梯度跃迁
        let pupilDevY = (devDarkY * 0.90) - (cRatio * 0.55) + (devGrad * 0.25);

        // 生理学向上微缩补偿：眼球向上转动时进行非线性微加速，使上移顺畅轻松
        if (pupilDevY < 0) {
            pupilDevY = pupilDevY * 1.25;
        }

        return {
            x: subpixelX / w,
            y: normPupilY,
            devX: pupilDevX,
            devY: pupilDevY
        };
    }

    function trackerFrameLoop() {
        if (state.isWebgazerReady && !state.isSimulated) {
            ensureCameraFeedMounted();
            processGeometricGaze();
        }
        requestAnimationFrame(trackerFrameLoop);
    }

    function onGazeSample(data) {
        if (state.isSimulated) return;
        if (data && data.eyeFeatures) {
            state.lastEyeFeatures = data.eyeFeatures;
        }
        if (data && Number.isFinite(data.x) && Number.isFinite(data.y)) {
            state.webgazerGaze = { x: data.x, y: data.y };
            state.webgazerSampleAt = performance.now();
            state.fpsCounter++;
            if (state.webgazerSampleAt - state.fpsTimer >= 1000) {
                state.currentFPS = Math.round((state.fpsCounter * 1000) / (state.webgazerSampleAt - state.fpsTimer));
                if (DOM.fpsDisplay) DOM.fpsDisplay.textContent = state.currentFPS;
                state.fpsCounter = 0;
                state.fpsTimer = state.webgazerSampleAt;
            }
        }
    }

    function median(values) {
        if (!values.length) return NaN;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function percentile(values, q) {
        if (!values.length) return NaN;
        const sorted = [...values].sort((a, b) => a - b);
        const pos = (sorted.length - 1) * q;
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    }

    function syncMeasurementConfig() {
        const distance = DOM.viewDistanceCm ? parseFloat(DOM.viewDistanceCm.value) : CONFIG.screenDistanceCm;
        const diagonal = DOM.screenDiagonalIn ? parseFloat(DOM.screenDiagonalIn.value) : CONFIG.screenDiagonalIn;
        if (Number.isFinite(distance)) CONFIG.screenDistanceCm = Math.min(120, Math.max(30, distance));
        if (Number.isFinite(diagonal)) CONFIG.screenDiagonalIn = Math.min(60, Math.max(8, diagonal));
    }

    function pixelsPerCm() {
        const diagonalPx = Math.hypot(window.screen.width || window.innerWidth, window.screen.height || window.innerHeight);
        return diagonalPx / (CONFIG.screenDiagonalIn * 2.54);
    }

    function pxToDeg(px) {
        const cm = px / Math.max(1, pixelsPerCm());
        return 2 * Math.atan((cm / 2) / CONFIG.screenDistanceCm) * (180 / Math.PI);
    }

    function applyScreenCorrection(x, y) {
        return {
            x: Math.max(5, Math.min(window.innerWidth - 5, x + state.screenCorrection.x)),
            y: Math.max(5, Math.min(window.innerHeight - 5, y + state.screenCorrection.y))
        };
    }

    function getRecentPredictionMedian(maxAgeMs = 900) {
        const cutoff = performance.now() - maxAgeMs;
        const recent = state.recentWebgazerPredictions.filter(p => p.t >= cutoff);
        if (recent.length < 4) return null;
        return {
            x: median(recent.map(p => p.x)),
            y: median(recent.map(p => p.y)),
            count: recent.length
        };
    }

    function addScreenTranslationCorrection(dx, dy) {
        const nextX = Math.max(-window.innerWidth * 0.45, Math.min(window.innerWidth * 0.45, state.screenCorrection.x + dx));
        const nextY = Math.max(-window.innerHeight * 0.45, Math.min(window.innerHeight * 0.45, state.screenCorrection.y + dy));
        const safeDx = nextX - state.screenCorrection.x;
        const safeDy = nextY - state.screenCorrection.y;
        state.screenCorrection.x = nextX;
        state.screenCorrection.y = nextY;
        state.filterBuffer = [];
        state.filterLastAt = 0;
        updateCorrectionDisplay();
        return { x: safeDx, y: safeDy };
    }

    function updateCorrectionDisplay() {
        if (!DOM.gazeCorrectionText) return;
        const x = Math.round(state.screenCorrection.x);
        const y = Math.round(state.screenCorrection.y);
        DOM.gazeCorrectionText.textContent = `X ${x >= 0 ? '+' : ''}${x} / Y ${y >= 0 ? '+' : ''}${y} px`;
    }

    // 自适应抗噪滤波与阻尼器：5 帧中值剔除单帧跳跃，速度分段阻尼，杜绝高频锯齿
    function updateRobustGaze(x, y, now) {
        state.filterBuffer.push({ x, y });
        if (state.filterBuffer.length > 5) state.filterBuffer.shift();
        const mx = median(state.filterBuffer.map(p => p.x));
        const my = median(state.filterBuffer.map(p => p.y));

        const dx = mx - state.smoothGaze.x;
        const dy = my - state.smoothGaze.y;
        const dist = Math.hypot(dx, dy);

        // 异常野值剔除（眨眼/光照跳跃）：单帧位移超过 160px 进行软限幅
        let targetX = mx;
        let targetY = my;
        const maxStep = 160.0;
        if (dist > maxStep) {
            const ratio = maxStep / dist;
            targetX = state.smoothGaze.x + dx * ratio;
            targetY = state.smoothGaze.y + dy * ratio;
        }

        const clampedDx = targetX - state.smoothGaze.x;
        const clampedDy = targetY - state.smoothGaze.y;
        const clampedDist = Math.hypot(clampedDx, clampedDy);

        // 根据平滑度等级 (smoothLevel: 1~5) 调节平滑阻尼
        // 1=快速响应, 3=平衡推荐, 5=超强防抖
        const baseAlpha = (6 - state.smoothLevel) * 0.035;
        let alpha;
        if (clampedDist < 8.0) {
            // 静止驻留：强阻尼平滑，锁住视线消除摄像头噪点抖动
            alpha = baseAlpha * 0.8;
        } else if (clampedDist < 50.0) {
            // 平滑追随：丝滑平缓过渡，保持良好动态响应，绝无剧烈锯齿
            const t = (clampedDist - 8.0) / 42.0;
            alpha = (baseAlpha * 0.8) + t * (0.24 - baseAlpha * 0.8);
        } else {
            // 快速扫视/折线顶点：适度加速，上限钳制在 0.52，保留 48% 阻尼防止超调振荡
            const t = Math.min(1.0, (clampedDist - 50.0) / 120.0);
            alpha = 0.24 + t * (0.52 - 0.24);
        }

        state.smoothGaze.x += clampedDx * alpha;
        state.smoothGaze.y += clampedDy * alpha;
        state.filterLastAt = now;
    }

    function processGeometricGaze() {
        if (typeof webgazer === 'undefined') return;
        const tracker = webgazer.getTracker();
        if (!tracker) return;

        const positions = (tracker.getPositions ? tracker.getPositions() : tracker.positionsArray);

        if (!positions || positions.length < 468) {
            state.faceLocked = false;
            state.gazeValid = false;
            DOM.eyeLockDot.className = 'dot red';
            DOM.eyeLockText.textContent = '未检测到面部';
            DOM.monitorBoxStatus.textContent = '🔴 未锁定';
            DOM.monitorCoachTip.textContent = '⚠️ 请正对摄像头，保持面部处于中央提示框内';
            DOM.monitorCoachTip.style.color = 'var(--accent-red)';
            return;
        }

        state.faceLocked = true;

        // 1. 提取面部稳定特征点 (Yaw 水平微偏航, Pitch 垂直微俯仰)
        const nose = positions[1];            // 鼻尖
        const leftEyeOuter = positions[33];   // 图像左侧眼角 (外)
        const rightEyeOuter = positions[263]; // 图像右侧眼角 (外)
        const noseBridge = positions[168];    // 两眼间鼻梁
        const chin = positions[152];          // 下巴

        const eyeMidX = (leftEyeOuter[0] + rightEyeOuter[0]) / 2;
        const eyeMidY = (leftEyeOuter[1] + rightEyeOuter[1]) / 2;
        const faceWidth = Math.max(40, Math.abs(rightEyeOuter[0] - leftEyeOuter[0]));
        const faceHeight = Math.max(50, Math.abs(chin[1] - noseBridge[1]));

        const headYaw = (nose[0] - eyeMidX) / faceWidth;
        const headPitch = (nose[1] - eyeMidY) / faceHeight;

        // 2. 提取纯净眼球多特征位移 (优先从帧同步 Canvas 裁切，无眉毛干扰，转眼即动，无需抬头！)
        let pupilDevX = 0, pupilDevY = 0;
        const videoCanvas = (typeof webgazer !== 'undefined' && webgazer.getVideoElementCanvas && webgazer.getVideoElementCanvas()) || document.getElementById('webgazerVideoCanvas');
        const videoFeed = document.getElementById('webgazerVideoFeed');
        const videoSource = (videoCanvas && videoCanvas.width > 0) ? videoCanvas : videoFeed;

        const eyeOpenL = Math.abs(positions[159][1] - positions[145][1]) / Math.max(1, Math.abs(positions[33][0] - positions[133][0]));
        const eyeOpenR = Math.abs(positions[386][1] - positions[374][1]) / Math.max(1, Math.abs(positions[263][0] - positions[362][0]));
        const eyesOpen = (eyeOpenL + eyeOpenR) / 2 > 0.075;
        const srcWidth = (videoSource && (videoSource.width || videoSource.videoWidth)) || 320;
        const srcHeight = (videoSource && (videoSource.height || videoSource.videoHeight)) || 240;
        const faceCentered = nose[0] > srcWidth * 0.25 && nose[0] < srcWidth * 0.75 &&
            eyeMidY > srcHeight * 0.18 && eyeMidY < srcHeight * 0.62;
        state.faceQuality = { centered: faceCentered, eyesOpen };

        let pL = null;
        let pR = null;

        if (videoSource) {
            // 图像左侧眼睛 (Anatomical Right Eye: 外角33, 内角133, 上睑160/159/158, 下睑144/145/153)
            const rightUpper = [positions[160], positions[159], positions[158]];
            const rightLower = [positions[144], positions[145], positions[153]];
            pL = getEyePupilFromVideo(videoSource, positions[33], positions[133], rightUpper, rightLower);

            // 图像右侧眼睛 (Anatomical Left Eye: 外角263, 内角362, 上睑387/386/385, 下睑373/374/380)
            const leftUpper = [positions[387], positions[386], positions[385]];
            const leftLower = [positions[373], positions[374], positions[380]];
            pR = getEyePupilFromVideo(videoSource, positions[263], positions[362], leftUpper, leftLower);
        }

        if (pL && pR) {
            pupilDevX = (pL.devX + pR.devX) / 2;
            pupilDevY = (pL.devY + pR.devY) / 2;
        } else if (pL) {
            pupilDevX = pL.devX;
            pupilDevY = pL.devY;
        } else if (pR) {
            pupilDevX = pR.devX;
            pupilDevY = pR.devY;
        } else if (state.lastEyeFeatures && state.lastEyeFeatures.left) {
            const fallback = extractDualCuePupil(state.lastEyeFeatures.left.patch);
            if (fallback) {
                pupilDevX = fallback.devX;
                pupilDevY = fallback.devY;
            }
        }

        // 3. 特征域低通平滑 (EMA)：源头消除摄像头微弱噪点，防止被屏幕比例尺放大
        const featAlpha = state.smoothLevel >= 4 ? 0.35 : state.smoothLevel >= 3 ? 0.50 : 0.70;
        if (!state.featureFilter.initialized) {
            state.featureFilter.devX = pupilDevX;
            state.featureFilter.devY = pupilDevY;
            state.featureFilter.initialized = true;
        } else {
            state.featureFilter.devX += (pupilDevX - state.featureFilter.devX) * featAlpha;
            state.featureFilter.devY += (pupilDevY - state.featureFilter.devY) * featAlpha;
        }
        const filteredDevX = state.featureFilter.devX;
        const filteredDevY = state.featureFilter.devY;

        // 4. 边缘非线性幂律拓展函数 (Nonlinear Boundary Expansion)：
        // 保持中心区域线性平稳，向左右边缘延伸时自然加速，使视线轻快达到左右边界 (0.05W ~ 0.95W)
        const signX = Math.sign(filteredDevX);
        const absX = Math.abs(filteredDevX);
        const expandedDevX = signX * (absX + 1.8 * Math.pow(absX, 1.35));

        // 几何融合解算视线向量：
        // 水平基准增益提升为 6.8x，加上 1.8x 边缘拓展与独立水平范围乘数，左右边缘转眼即达！
        // 垂直增益保持 2.8x 纯眼球暗质心驱动，无需抬头！
        const cameraGazeX = (expandedDevX * 6.8) + (headYaw * 0.40);
        const cameraGazeY = (filteredDevY * 2.8) + (headPitch * 0.12);

        state.currentCameraGazeX = cameraGazeX;
        state.currentCameraGazeY = cameraGazeY;

        // 维护滑动时间窗口采样缓存 (用于空格键稳健校准)
        state.recentCameraSamples.push({ x: cameraGazeX, y: cameraGazeY });
        if (state.recentCameraSamples.length > 6) {
            state.recentCameraSamples.shift();
        }

        // 5. 自适应初始基准点
        if (!state.isBaselineCalibrated) {
            state.baselineWarmupSamples.push({ x: cameraGazeX, y: cameraGazeY });
            if (state.baselineWarmupSamples.length >= 15) {
                let sumX = 0, sumY = 0;
                state.baselineWarmupSamples.forEach(s => { sumX += s.x; sumY += s.y; });
                state.baselineCameraX = sumX / state.baselineWarmupSamples.length;
                state.baselineCameraY = sumY / state.baselineWarmupSamples.length;
                state.isBaselineCalibrated = true;
            } else {
                state.baselineCameraX = cameraGazeX;
                state.baselineCameraY = cameraGazeY;
            }
        }

        // 6. 核心坐标基准对齐：以竞技场物理中心为原点，进行自适应视界缩放
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        let centerX = screenW / 2;
        let centerY = screenH / 2;
        let spanX = screenW * 0.48 * (state.sensitivityGain / 2.8) * (state.horizontalGainRatio / 2.2);
        let spanY = screenH * 0.48 * (state.sensitivityGain * state.verticalGainRatio / 2.8);

        if (state.currentStage === 'experiment' && DOM.arena) {
            const rect = DOM.arena.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50) {
                centerX = rect.left + rect.width / 2;
                centerY = rect.top + rect.height / 2;
                spanX = (rect.width / 2) * 1.15 * (state.sensitivityGain / 2.8) * (state.horizontalGainRatio / 2.2);
                spanY = (rect.height / 2) * 1.35 * (state.sensitivityGain * state.verticalGainRatio / 2.8);
            }
        }

        const deltaX = -(cameraGazeX - state.baselineCameraX);
        const deltaY = (cameraGazeY - state.baselineCameraY);

        let targetScreenX = centerX + (deltaX * spanX);
        let targetScreenY = centerY + (deltaY * spanY);

        targetScreenX = Math.max(10, Math.min(screenW - 10, targetScreenX));
        targetScreenY = Math.max(10, Math.min(screenH - 10, targetScreenY));

        state.rawGaze.x = targetScreenX;
        state.rawGaze.y = targetScreenY;
        state.gazeValid = eyesOpen && faceCentered && state.isBaselineCalibrated;
        updateRobustGaze(targetScreenX, targetScreenY, performance.now());

        DOM.eyeLockDot.className = state.gazeValid ? 'dot green' : 'dot yellow';
        DOM.eyeLockText.textContent = !eyesOpen ? '眨眼/闭眼' : !faceCentered ? '头位偏移' : '有效视线';
        DOM.monitorBoxStatus.textContent = state.gazeValid ? '🟢 数据有效' : '🟡 暂停采样';

        DOM.gazeCoordsText.textContent = `(${Math.round(state.smoothGaze.x)}, ${Math.round(state.smoothGaze.y)})`;
        const directionCenterX = state.currentStage === 'experiment' && DOM.arena ? centerX : screenW / 2;
        const directionCenterY = state.currentStage === 'experiment' && DOM.arena ? centerY : screenH / 2;
        updateDirectionBadge(
            (state.smoothGaze.x - directionCenterX) / Math.max(1, screenW / 2),
            (state.smoothGaze.y - directionCenterY) / Math.max(1, screenH / 2)
        );

        if (state.showGazeDot) {
            DOM.liveCursor.style.display = 'block';
            DOM.liveCursor.style.left = `${state.smoothGaze.x}px`;
            DOM.liveCursor.style.top = `${state.smoothGaze.y}px`;
        } else {
            DOM.liveCursor.style.display = 'none';
        }

        checkFaceCenteringCoach(nose[0] / srcWidth, eyeMidY / srcHeight, eyesOpen);

    }

    function updateDirectionBadge(deltaX, deltaY) {
        const badge = DOM.gazeDirBadge;
        if (!badge) return;

        const th = 0.025;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX < th && absY < th) {
            badge.textContent = '🎯 居中';
            badge.className = 'dir-tag center';
        } else if (absX >= absY) {
            if (deltaX > 0) {
                badge.textContent = '👉 向右';
                badge.className = 'dir-tag right';
            } else {
                badge.textContent = '👈 向左';
                badge.className = 'dir-tag left';
            }
        } else {
            if (deltaY > 0) {
                badge.textContent = '👇 向下';
                badge.className = 'dir-tag down';
            } else {
                badge.textContent = '👆 向上';
                badge.className = 'dir-tag up';
            }
        }
    }

    function checkFaceCenteringCoach(noseXNorm, eyeYNorm, eyesOpen) {
        const now = performance.now();
        if (now - state.coachTimer < 350) return;
        state.coachTimer = now;

        if (!eyesOpen) {
            DOM.monitorCoachTip.textContent = '👁️ 检测到眨眼或眼睑遮挡，本帧不计入分析';
            DOM.monitorCoachTip.style.color = 'var(--accent-yellow)';
        } else if (eyeYNorm > 0.62) {
            DOM.monitorCoachTip.textContent = '👇 面部偏下，建议稍抬头，或将笔记本屏幕稍向前压低';
            DOM.monitorCoachTip.style.color = 'var(--accent-yellow)';
        } else if (eyeYNorm < 0.18) {
            DOM.monitorCoachTip.textContent = '👆 面部偏上，请稍低头对准中央十字框';
            DOM.monitorCoachTip.style.color = 'var(--accent-yellow)';
        } else if (Math.abs(noseXNorm - 0.5) > 0.25) {
            DOM.monitorCoachTip.textContent = '👈👉 面部偏离左右，请稍向中央对齐';
            DOM.monitorCoachTip.style.color = 'var(--accent-yellow)';
        } else {
            DOM.monitorCoachTip.textContent = '🟢 面部已精准居中！视线解算处于最佳状态';
            DOM.monitorCoachTip.style.color = 'var(--accent-green)';
        }
    }

    function recenterToGaze() {
        if (state.currentStage === 'calibration') return;
        if (state.recentCameraSamples && state.recentCameraSamples.length > 0) {
            let sumX = 0, sumY = 0;
            state.recentCameraSamples.forEach(s => { sumX += s.x; sumY += s.y; });
            state.baselineCameraX = sumX / state.recentCameraSamples.length;
            state.baselineCameraY = sumY / state.recentCameraSamples.length;
        } else {
            state.baselineCameraX = state.currentCameraGazeX;
            state.baselineCameraY = state.currentCameraGazeY;
        }
        state.isBaselineCalibrated = true;

        let cx = window.innerWidth / 2;
        let cy = window.innerHeight / 2;
        if (state.currentStage === 'experiment' && DOM.arena) {
            const rect = DOM.arena.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50) {
                cx = rect.left + rect.width / 2;
                cy = rect.top + rect.height / 2;
            }
        }

        state.smoothGaze.x = cx;
        state.smoothGaze.y = cy;
        state.rawGaze.x = cx;
        state.rawGaze.y = cy;
        state.filterBuffer = [{ x: cx, y: cy }];
        state.featureFilter = { devX: 0, devY: 0, initialized: false };

        if (DOM.liveCursor) {
            DOM.liveCursor.style.display = 'block';
            DOM.liveCursor.style.left = `${cx}px`;
            DOM.liveCursor.style.top = `${cy}px`;
        }

        if (DOM.gazeCorrectionText) {
            DOM.gazeCorrectionText.textContent = `X 0 / Y 0 px`;
        }

        DOM.btnRecenterZero.textContent = '✅ 中心基准已锁定';
        DOM.monitorCoachTip.textContent = '🎯 视线基准已锁定，转动眼球即可全向精确控制！';
        DOM.monitorCoachTip.style.color = 'var(--accent-green)';

        setTimeout(() => {
            if (DOM.btnRecenterZero) {
                DOM.btnRecenterZero.textContent = '🎯 看中心对齐 (空格键)';
            }
        }, 1800);
    }

    async function clearAllDrift() {
        if (typeof webgazer !== 'undefined' && webgazer.clearData) {
            try { await webgazer.clearData(); } catch(e) {}
        }
        try {
            if (window.indexedDB && window.indexedDB.deleteDatabase) {
                window.indexedDB.deleteDatabase('localforage');
            }
        } catch(e) {}

        state.calibrationComplete = false;
        state.validationResults = null;
        state.webgazerGaze = null;
        state.recentWebgazerPredictions = [];
        state.screenCorrection = { x: 0, y: 0 };
        updateCorrectionDisplay();
        state.filterBuffer = [];
        recenterToGaze();

        DOM.btnClearDrift.textContent = '✨ 校准已清除';
        setTimeout(() => {
            DOM.btnClearDrift.textContent = '🧹 清除校准';
        }, 1200);
    }

    // ==========================================
    // 6. 6大几何任务管理与多维实验引擎
    // ==========================================
    function initTaskArena() {
        const rect = DOM.arena.getBoundingClientRect();
        const W = rect.width || 900;
        const H = rect.height || 500;

        DOM.targetCanvas.width = W;
        DOM.targetCanvas.height = H;
        DOM.trailCanvas.width = W;
        DOM.trailCanvas.height = H;
        DOM.tractionCanvas.width = W;
        DOM.tractionCanvas.height = H;
    }

    /**
     * 切换并初始化特定任务
     */
    function loadTask(taskId) {
        if (!TASKS[taskId]) return;
        state.currentTaskId = taskId;
        const task = TASKS[taskId];

        // 更新导航栏 Tab 激活状态
        DOM.taskTabBtns.forEach(btn => {
            if (btn.getAttribute('data-task') === taskId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 更新 HUD 标题与提示
        DOM.hudTaskName.textContent = task.fullName;
        DOM.expTipsText.innerHTML = `👀 <strong>操作方式</strong>：${task.tip}`;
        DOM.taskSuccessBanner.style.display = 'none';

        // 预采样目标曲线密集几何点与总弧长
        const rect = DOM.arena.getBoundingClientRect();
        const W = rect.width || 900;
        const H = rect.height || 500;

        state.taskDensePoints = [];
        const sampleCount = 350;
        for (let i = 0; i <= sampleCount; i++) {
            const t = i / sampleCount;
            state.taskDensePoints.push(task.getPathPoint(t, W, H));
        }

        let totalLen = 0;
        for (let i = 1; i < state.taskDensePoints.length; i++) {
            const p0 = state.taskDensePoints[i - 1];
            const p1 = state.taskDensePoints[i];
            totalLen += Math.hypot(p1.x - p0.x, p1.y - p0.y);
        }
        state.taskTotalLength = Math.max(1, totalLen);

        // 绘制标准几何模板
        drawTargetPath(task, W, H);

        // 重置任务状态并启动
        startTaskExecution();
    }

    function startTaskExecution() {
        state.taskRunId++;
        const runId = state.taskRunId;
        state.taskActive = false;
        state.taskStartTime = 0;
        state.taskLastFrameAt = 0;
        state.lastRecordedAt = 0;
        state.lastRecordedPredictionAt = 0;
        state.taskProgress = 0.0;
        state.taskUserTrail = [];
        state.taskLiveScore = 100;

        // 清空轨迹与牵引光束画布
        clearCanvas(DOM.trailCanvas);
        clearCanvas(DOM.tractionCanvas);

        // 更新小球初始位置
        updateTargetBallPosition();
        updateHUDProgress(0);
        DOM.hudTimer.textContent = '准备 1.2 s';
        DOM.hudLiveScore.textContent = '--°';

        setTimeout(() => {
            if (runId !== state.taskRunId || state.currentStage !== 'experiment') return;
            state.taskActive = true;
            state.taskStartTime = performance.now();
            state.taskLastFrameAt = state.taskStartTime;
            requestAnimationFrame(() => taskAnimationLoop(runId));
        }, 1200);
    }

    /**
     * 绘制标准几何模板轨迹 (包含起止门柱、荧光导轨与方向箭头)
     */
    function drawTargetPath(task, W, H) {
        const ctx = DOM.targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        const pts = state.taskDensePoints;
        if (!pts || pts.length < 2) return;

        ctx.save();

        // 1. 绘制外层荧光氛围晕染
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // 2. 绘制清晰几何虚线导轨
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([8, 6]);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. 绘制路径方向引导箭头
        const arrowIndices = [0.2, 0.4, 0.6, 0.8];
        arrowIndices.forEach(ratio => {
            const idx = Math.floor(ratio * (pts.length - 2));
            const pCurr = pts[idx];
            const pNext = pts[idx + 1];
            const angle = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);

            ctx.save();
            ctx.translate(pCurr.x, pCurr.y);
            ctx.rotate(angle);
            ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
            ctx.beginPath();
            ctx.moveTo(7, 0);
            ctx.lineTo(-5, -4);
            ctx.lineTo(-2, 0);
            ctx.lineTo(-5, 4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        // 4. 绘制起点标志 (START)
        const pStart = pts[0];
        ctx.beginPath();
        ctx.arc(pStart.x, pStart.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('起点', pStart.x, pStart.y - 18);

        // 5. 绘制终点标志 (GOAL)
        const pEnd = pts[pts.length - 1];
        if (!task.closed) {
            ctx.beginPath();
            ctx.arc(pEnd.x, pEnd.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
            ctx.fill();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('终点', pEnd.x, pEnd.y - 18);
        }

        // 6. 绘制竞技场物理中心瞄准基准点（指示空格键对齐目标）
        const cx = W / 2;
        const cy = H / 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy);
        ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
    }

    /**
     * 实验物理与渲染主循环
     */
    function taskAnimationLoop(runId) {
        if (!state.taskActive || state.currentStage !== 'experiment' || runId !== state.taskRunId) return;

        const arenaRect = DOM.arena.getBoundingClientRect();
        const W = arenaRect.width || 900;
        const H = arenaRect.height || 500;
        const task = TASKS[state.currentTaskId];

        // 计算当前被试相对竞技场的视线落点
        const gazeRelX = state.smoothGaze.x - arenaRect.left;
        const gazeRelY = state.smoothGaze.y - arenaRect.top;

        const frameNow = performance.now();
        const dt = Math.min(0.1, Math.max(0, (frameNow - state.taskLastFrameAt) / 1000));
        state.taskLastFrameAt = frameNow;

        // 当前目标引导球位置
        let ballPos = task.getPathPoint(state.taskProgress, W, H);

        // 1. 沿路径计算视线牵引前进逻辑
        if (state.controlMode === 'research') {
            state.taskProgress = Math.min(1, state.taskProgress + (CONFIG.researchTargetSpeedPxS * dt) / state.taskTotalLength);
            updateHUDProgress(state.taskProgress);
            ballPos = task.getPathPoint(state.taskProgress, W, H);
        } else {
            updateTaskProgressPhysics(task, W, H, ballPos, gazeRelX, gazeRelY);
        }

        // 2. 绘制视线实时流动轨迹
        drawLiveUserTrail();

        // 3. 绘制目标球与视线之间的激光牵引光束
        drawTractionLaser(ballPos, gazeRelX, gazeRelY);

        // 4. 更新小球位置与 HUD 进度
        updateTargetBallPosition();

        if (frameNow - state.lastRecordedAt >= CONFIG.sampleIntervalMs) {
            recordSamplePoint(frameNow);
            state.lastRecordedAt = frameNow;
        }

        const elapsedSec = ((performance.now() - state.taskStartTime) / 1000).toFixed(2);
        DOM.hudTimer.textContent = `${elapsedSec} s`;

        // 5. 判定任务完成
        if (state.taskProgress >= 0.985) {
            state.taskProgress = 1.0;
            updateHUDProgress(1);
            updateTargetBallPosition();
            clearCanvas(DOM.tractionCanvas);
            onTaskCompleted(task, elapsedSec);
            return;
        }

        requestAnimationFrame(() => taskAnimationLoop(runId));
    }

    /**
     * 沿几何路径的高效率视线牵引与注视动力学 (全几何图形自适应高速推进)
     */
    function updateTaskProgressPhysics(task, W, H, ballPos, gazeRelX, gazeRelY) {
        const pts = state.taskDensePoints;
        const totalPts = pts.length;
        if (totalPts < 2) return;

        const currIdx = Math.round(state.taskProgress * (totalPts - 1));
        const distToBall = Math.hypot(gazeRelX - ballPos.x, gazeRelY - ballPos.y);

        if (state.controlMode === 'guidance') {
            // 【高效视线引力牵引模式】
            // 搜索前方窗口内离视线最近的点（支持闭合图形顺畅过弯与转角过渡）
            const lookahead = Math.min(120, totalPts - 1);
            let bestAheadIdx = currIdx;
            let minDistAhead = Infinity;

            for (let offset = 1; offset <= lookahead; offset++) {
                let idx = currIdx + offset;
                if (idx >= totalPts) {
                    if (task.closed) idx = idx % totalPts;
                    else break;
                }
                const d = Math.hypot(pts[idx].x - gazeRelX, pts[idx].y - gazeRelY);
                if (d < minDistAhead) {
                    minDistAhead = d;
                    bestAheadIdx = currIdx + offset;
                }
            }

            // 计算前瞻目标相对当前位置的路径物理距离
            let forwardDistPx = 0;
            const stepsAhead = bestAheadIdx - currIdx;
            for (let i = currIdx; i < bestAheadIdx && i < totalPts - 1; i++) {
                forwardDistPx += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            }

            // 粗略切向投影判定 (视线处于小球大致前进方向的前方半球)
            const guideIdx = Math.min(totalPts - 1, currIdx + 10);
            const tanX = pts[guideIdx].x - ballPos.x;
            const tanY = pts[guideIdx].y - ballPos.y;
            const tanLen = Math.hypot(tanX, tanY) || 1;
            const dot = ((gazeRelX - ballPos.x) * (tanX / tanLen)) + ((gazeRelY - ballPos.y) * (tanY / tanLen));

            let speedPx = 0;

            if (minDistAhead < 220 && stepsAhead > 1) {
                // 1. 视线在前方轨道附近注视引流：依据视线前瞻距离产生强劲冲力
                speedPx = Math.min(Math.max(forwardDistPx * 0.12, 4.5), 36.0);
            } else if (dot > 15) {
                // 2. 视线在小球大致前进方向的前方半球：提供持续推力
                speedPx = Math.min(Math.max(dot * 0.08, 3.8), 30.0);
            } else if (distToBall < 110) {
                // 3. 视线紧密追随小球本体 (Smooth Pursuit)：稳定匀速向前推进
                speedPx = 4.2;
            }

            if (speedPx > 0) {
                const effectiveSpeed = speedPx * (state.sensitivityGain / 3.0);
                const deltaProgress = effectiveSpeed / state.taskTotalLength;
                state.taskProgress = Math.min(1.0, state.taskProgress + deltaProgress);
            }
        } else {
            // 【直接注视映射模式】
            const searchWindow = Math.min(120, totalPts - 1);
            let closestIdx = currIdx;
            let minDist = Math.hypot(pts[currIdx].x - gazeRelX, pts[currIdx].y - gazeRelY);

            for (let offset = 1; offset <= searchWindow; offset++) {
                let idx = currIdx + offset;
                if (idx >= totalPts) {
                    if (task.closed) idx = idx % totalPts;
                    else break;
                }
                const d = Math.hypot(pts[idx].x - gazeRelX, pts[idx].y - gazeRelY);
                if (d < minDist) {
                    minDist = d;
                    closestIdx = currIdx + offset;
                }
            }

            const targetProgress = Math.min(1.0, closestIdx / (totalPts - 1));
            if (targetProgress > state.taskProgress) {
                state.taskProgress += (targetProgress - state.taskProgress) * 0.35;
            }
        }

        updateHUDProgress(state.taskProgress);
    }

    function findClosestTOnPath(gx, gy) {
        const pts = state.taskDensePoints;
        let minDist = Infinity;
        let bestIdx = 0;
        for (let i = 0; i < pts.length; i++) {
            const d = Math.hypot(pts[i].x - gx, pts[i].y - gy);
            if (d < minDist) {
                minDist = d;
                bestIdx = i;
            }
        }
        return bestIdx / (pts.length - 1);
    }

    function updateTargetBallPosition() {
        const rect = DOM.arena.getBoundingClientRect();
        const W = rect.width || 900;
        const H = rect.height || 500;
        const task = TASKS[state.currentTaskId];
        const p = task.getPathPoint(state.taskProgress, W, H);

        DOM.ball.style.left = `${p.x}px`;
        DOM.ball.style.top = `${p.y}px`;
    }

    function updateHUDProgress(progressRatio) {
        const pct = Math.round(Math.min(100, Math.max(0, progressRatio * 100)));
        DOM.hudProgressBar.style.setProperty('--progress-pct', `${pct}%`);
        DOM.hudProgressText.textContent = `${pct}%`;
    }

    /**
     * 实时采集与记录样本
     */
    function recordSamplePoint(now) {
        const arenaRect = DOM.arena.getBoundingClientRect();
        const gx = state.smoothGaze.x - arenaRect.left;
        const gy = state.smoothGaze.y - arenaRect.top;

        // 路径误差与同一时刻目标误差分开记录；正式追随评估以同步目标误差为主。
        const pts = state.taskDensePoints;
        let minD = Infinity;
        for (let i = 0; i < pts.length; i += 2) {
            const d = Math.hypot(pts[i].x - gx, pts[i].y - gy);
            if (d < minD) minD = d;
        }

        const task = TASKS[state.currentTaskId];
        const target = task.getPathPoint(state.taskProgress, arenaRect.width, arenaRect.height);
        const targetError = Math.hypot(target.x - gx, target.y - gy);
        const sourceAgeMs = state.isSimulated ? 0 : performance.now() - state.webgazerSampleAt;
        const isFresh = state.isSimulated || sourceAgeMs <= CONFIG.gazeStaleMs;
        const isNewPrediction = state.isSimulated || state.webgazerSampleAt > state.lastRecordedPredictionAt;
        const valid = Boolean(state.gazeValid && isFresh && isNewPrediction && gx >= 0 && gy >= 0 && gx <= arenaRect.width && gy <= arenaRect.height);
        const sample = {
            t: Math.round(now - state.taskStartTime),
            taskId: state.currentTaskId,
            gazeX: Math.round(state.smoothGaze.x),
            gazeY: Math.round(state.smoothGaze.y),
            webgazerRawX: state.webgazerGaze ? Math.round(state.webgazerGaze.x) : null,
            webgazerRawY: state.webgazerGaze ? Math.round(state.webgazerGaze.y) : null,
            correctionX: parseFloat(state.screenCorrection.x.toFixed(1)),
            correctionY: parseFloat(state.screenCorrection.y.toFixed(1)),
            arenaX: Math.round(gx),
            arenaY: Math.round(gy),
            targetX: Math.round(target.x),
            targetY: Math.round(target.y),
            progress: parseFloat(state.taskProgress.toFixed(3)),
            errorPx: parseFloat(minD.toFixed(1)),
            targetErrorPx: parseFloat(targetError.toFixed(1)),
            valid: valid ? 1 : 0,
            faceCentered: state.isSimulated || state.faceQuality.centered ? 1 : 0,
            eyesOpen: state.isSimulated || state.faceQuality.eyesOpen ? 1 : 0
        };

        sample.sourceAgeMs = Math.round(sourceAgeMs);
        if (valid && !state.isSimulated) state.lastRecordedPredictionAt = state.webgazerSampleAt;

        state.taskUserTrail.push(sample);
        state.allSessionSamples.push(sample);

        // 动态实时匹配度计算与显示
        if (state.taskUserTrail.length % 6 === 0) {
            const lastSamples = state.taskUserTrail.slice(-25).filter(s => s.valid);
            const medErr = median(lastSamples.map(s => s.targetErrorPx));
            DOM.hudLiveScore.textContent = Number.isFinite(medErr) ? `${pxToDeg(medErr).toFixed(2)}°` : '数据无效';
        }
    }

    /**
     * 绘制被试实际视线轨迹流 (青紫渐变发光轨迹)
     */
    function drawLiveUserTrail() {
        const ctx = DOM.trailCanvas.getContext('2d');
        const trail = state.taskUserTrail.filter(s => s.valid);
        if (trail.length < 2) return;

        ctx.clearRect(0, 0, DOM.trailCanvas.width, DOM.trailCanvas.height);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(trail[0].arenaX, trail[0].arenaY);

        for (let i = 1; i < trail.length; i++) {
            ctx.lineTo(trail[i].arenaX, trail[i].arenaY);
        }

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 12;
        ctx.stroke();

        ctx.restore();
    }

    /**
     * 绘制小球与视线之间的激光牵引力线
     */
    function drawTractionLaser(ballPos, gazeX, gazeY) {
        const ctx = DOM.tractionCanvas.getContext('2d');
        ctx.clearRect(0, 0, DOM.tractionCanvas.width, DOM.tractionCanvas.height);

        const dist = Math.hypot(gazeX - ballPos.x, gazeY - ballPos.y);
        if (dist > 15 && dist < 320) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ballPos.x, ballPos.y);
            ctx.lineTo(gazeX, gazeY);

            ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 14;
            ctx.setLineDash([7, 5]);
            ctx.stroke();

            // 视线牵引波纹
            ctx.beginPath();
            ctx.arc(gazeX, gazeY, 18, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.stroke();

            ctx.restore();
        }
    }

    function clearCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // ==========================================
    // 7. 任务完成与多维指标深度计算
    // ==========================================
    function estimatePursuitLagMs(samples) {
        if (samples.length < 12) return null;
        const extent = values => Math.max(...values) - Math.min(...values);
        const gazeAmplitude = Math.hypot(extent(samples.map(s => s.arenaX)), extent(samples.map(s => s.arenaY)));
        const targetAmplitude = Math.hypot(extent(samples.map(s => s.targetX)), extent(samples.map(s => s.targetY)));
        if (targetAmplitude < 50 || gazeAmplitude < targetAmplitude * 0.2) return null;
        let best = { shift: 0, rmse: Infinity };
        let zeroShiftRmse = Infinity;
        const maxShift = Math.min(18, Math.floor(samples.length / 4));
        for (let shift = 0; shift <= maxShift; shift++) {
            let sum = 0;
            let n = 0;
            for (let i = shift; i < samples.length; i++) {
                const gaze = samples[i];
                const target = samples[i - shift];
                const d = Math.hypot(gaze.arenaX - target.targetX, gaze.arenaY - target.targetY);
                if (d < Math.hypot(window.innerWidth, window.innerHeight) * 0.5) {
                    sum += d * d;
                    n++;
                }
            }
            const rmse = n ? Math.sqrt(sum / n) : Infinity;
            if (shift === 0) zeroShiftRmse = rmse;
            if (rmse < best.rmse) best = { shift, rmse };
        }
        if (best.shift > 0 && best.rmse > zeroShiftRmse * 0.95) return null;
        const intervals = samples.slice(1).map((s, i) => s.t - samples[i].t).filter(v => v > 0 && v < 200);
        return Math.round(best.shift * (median(intervals) || CONFIG.sampleIntervalMs));
    }

    function onTaskCompleted(task, elapsedSec) {
        state.taskActive = false;

        const allTrail = state.taskUserTrail;
        const trail = allTrail.filter(s => s.valid);
        const targetErrors = trail.map(s => s.targetErrorPx);
        const pathErrors = trail.map(s => s.errorPx);
        const rmsePx = targetErrors.length ? Math.sqrt(targetErrors.reduce((a, v) => a + v * v, 0) / targetErrors.length) : NaN;
        const pathRmsePx = pathErrors.length ? Math.sqrt(pathErrors.reduce((a, v) => a + v * v, 0) / pathErrors.length) : NaN;
        const medianErrorPx = median(targetErrors);
        const p95ErrorPx = percentile(targetErrors, 0.95);
        const degError = pxToDeg(rmsePx);
        const medianDeg = pxToDeg(medianErrorPx);
        const validRate = allTrail.length ? (trail.length / allTrail.length) * 100 : 0;
        const lagMs = estimatePursuitLagMs(trail);

        // 3. 覆盖率 (Coverage %)
        const checkCount = 20;
        let covered = 0;
        const rect = DOM.arena.getBoundingClientRect();
        for (let i = 0; i < checkCount; i++) {
            const pt = task.getPathPoint(i / (checkCount - 1), rect.width, rect.height);
            const hasNearby = trail.some(s => Math.hypot(s.arenaX - pt.x, s.arenaY - pt.y) < 55);
            if (hasNearby) covered++;
        }
        const coveragePct = Math.round((covered / checkCount) * 100);

        const durationSec = parseFloat(elapsedSec) || 0.1;
        const targetVelocity = Math.round(state.taskTotalLength / durationSec);
        const baselineDeg = state.validationResults && Number.isFinite(state.validationResults.medianDeg)
            ? state.validationResults.medianDeg : 2.5;
        const excessDeg = Math.max(0, medianDeg - baselineDeg);
        const qualityFactor = Math.min(1, validRate / 85) * (coveragePct / 100);
        const score = Number.isFinite(medianDeg) ? Math.round(100 * Math.exp(-excessDeg / 4) * qualityFactor) : 0;

        // 保存当前任务结算指标
        state.completedTasks[task.id] = {
            task: task,
            duration: durationSec,
            rmsePx: Number.isFinite(rmsePx) ? parseFloat(rmsePx.toFixed(1)) : null,
            pathRmsePx: Number.isFinite(pathRmsePx) ? parseFloat(pathRmsePx.toFixed(1)) : null,
            medianErrorPx: Number.isFinite(medianErrorPx) ? parseFloat(medianErrorPx.toFixed(1)) : null,
            p95ErrorPx: Number.isFinite(p95ErrorPx) ? parseFloat(p95ErrorPx.toFixed(1)) : null,
            degError: Number.isFinite(degError) ? parseFloat(degError.toFixed(2)) : null,
            medianDeg: Number.isFinite(medianDeg) ? parseFloat(medianDeg.toFixed(2)) : null,
            score: score,
            coverage: coveragePct,
            validRate: parseFloat(validRate.toFixed(1)),
            lagMs: lagMs,
            velocity: targetVelocity,
            trail: [...trail],
            allTrail: [...allTrail],
            densePoints: [...state.taskDensePoints]
        };

        // 标记导航 Tab 为已完成
        const currentTabBtn = document.getElementById(`tab-task-${task.id}`);
        if (currentTabBtn) {
            currentTabBtn.classList.add('completed-tab');
        }

        // 弹窗展示单任务完成结果
        DOM.taskSuccessTitle.textContent = `🎉 ${task.fullName} 完成！`;
        DOM.taskResTime.textContent = `${elapsedSec}s`;
        DOM.taskResScore.textContent = `${score}分`;
        DOM.taskResRmse.textContent = Number.isFinite(rmsePx) ? `${rmsePx.toFixed(1)}px (${degError.toFixed(2)}°)` : '有效样本不足';
        DOM.taskSuccessBanner.style.display = 'block';
    }

    function proceedToNextTask() {
        DOM.taskSuccessBanner.style.display = 'none';
        const currentIndex = TASK_KEYS.indexOf(state.currentTaskId);

        if (currentIndex < TASK_KEYS.length - 1) {
            const nextTaskId = TASK_KEYS[currentIndex + 1];
            loadTask(nextTaskId);
        } else {
            // 所有 6 大任务已完成，自动进入总评估看板
            switchStage('results');
        }
    }

    function resetCurrentTask() {
        DOM.taskSuccessBanner.style.display = 'none';
        loadTask(state.currentTaskId);
    }

    // ==========================================
    // 8. 6大几何范式全维度评估看板渲染
    // ==========================================
    function renderResultsDashboard() {
        const completedIds = Object.keys(state.completedTasks);
        const totalCompleted = completedIds.length;

        let sumScore = 0;
        let sumDuration = 0;
        let sumDeg = 0;
        let validDegCount = 0;

        completedIds.forEach(id => {
            const res = state.completedTasks[id];
            sumScore += res.score;
            sumDuration += res.duration;
            if (Number.isFinite(res.degError)) {
                sumDeg += res.degError;
                validDegCount++;
            }
        });

        const avgScore = totalCompleted > 0 ? Math.round(sumScore / totalCompleted) : '--';
        const totalDur = sumDuration.toFixed(2);
        const avgDeg = validDegCount > 0 ? (sumDeg / validDegCount).toFixed(2) : '--';

        DOM.resOverallScore.textContent = `${avgScore} 分`;
        DOM.resTotalTime.textContent = `${totalDur} s`;
        DOM.resAvgDegError.textContent = `${avgDeg}°`;
        DOM.resTotalSamples.textContent = state.allSessionSamples.length;
        if (state.validationResults) {
            const v = state.validationResults;
            DOM.sessionQualityNote.textContent = `独立验证：中位准确度 ${v.medianDeg ?? '--'}°，RMS-S2S 精密度 ${v.precisionRmsS2SDeg ?? '--'}°，有效采样率 ${v.validRate}%。持续屏幕校正 X ${state.screenCorrection.x.toFixed(0)}px / Y ${state.screenCorrection.y.toFixed(0)}px。任务质量指数已扣除本次验证基线。`;
        } else {
            DOM.sessionQualityNote.textContent = '未完成独立验证：本报告仅作交互演示，误差和质量指数需谨慎解释。';
        }

        // 渲染 6 任务对比卡片矩阵
        renderTaskCardsGrid();

        // 渲染心理学眼动能力评价表
        renderPsychologyTable();
    }

    function renderTaskCardsGrid() {
        DOM.taskCardsGrid.innerHTML = '';

        TASK_KEYS.forEach(taskId => {
            const task = TASKS[taskId];
            const res = state.completedTasks[taskId];

            const card = document.createElement('div');
            card.className = 'task-result-card';

            const scoreClass = !res ? 'fair' : res.score >= 88 ? '' : res.score >= 75 ? 'good' : 'fair';
            const scoreText = res ? `${res.score}分` : '待测验';
            const timeText = res ? `${res.duration}s` : '--';
            const rmseText = res && res.rmsePx !== null ? `${res.rmsePx}px / ${res.degError}°` : '--';
            const coverageText = res ? `${res.coverage}%` : '--';

            card.innerHTML = `
                <div class="task-card-header">
                    <span class="task-card-title">${task.icon} ${task.name}</span>
                    <span class="task-card-score ${scoreClass}">${scoreText}</span>
                </div>
                <div class="task-mini-canvas-wrap">
                    <canvas id="mini-canvas-${taskId}" width="260" height="130"></canvas>
                </div>
                <div class="task-card-metrics">
                    <span>同步 RMSE: <strong>${rmseText}</strong></span>
                    <span>有效率: <strong>${res ? `${res.validRate}%` : '--'}</strong></span>
                    <span>覆盖: <strong>${coverageText}</strong></span>
                    <span>估计延迟: <strong>${res && res.lagMs !== null ? `${res.lagMs}ms` : '--'}</strong></span>
                </div>
            `;

            DOM.taskCardsGrid.appendChild(card);

            // 绘制卡片内 mini 对比画布 (绿色标准轨迹 + 青色真实眼动)
            setTimeout(() => {
                drawMiniComparisonCanvas(taskId, task, res);
            }, 50);
        });
    }

    function drawMiniComparisonCanvas(taskId, task, res) {
        const canvas = document.getElementById(`mini-canvas-${taskId}`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        // 网格背景
        ctx.strokeStyle = '#0e172a';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 30) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += 25) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // 1. 绘制标准几何模板 (绿色虚线)
        const pts = [];
        for (let i = 0; i <= 100; i++) {
            pts.push(task.getPathPoint(i / 100, W, H));
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. 如果已完成该任务，叠合实际注视轨迹 (青蓝色连续实线)
        if (res && res.trail && res.trail.length > 1) {
            const arenaRect = DOM.arena.getBoundingClientRect();
            const srcW = arenaRect.width || 900;
            const srcH = arenaRect.height || 500;
            const scaleX = W / srcW;
            const scaleY = H / srcH;

            ctx.beginPath();
            ctx.moveTo(res.trail[0].arenaX * scaleX, res.trail[0].arenaY * scaleY);
            for (let i = 1; i < res.trail.length; i++) {
                ctx.lineTo(res.trail[i].arenaX * scaleX, res.trail[i].arenaY * scaleY);
            }
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 8;
            ctx.stroke();
        } else {
            // 未完成提示
            ctx.fillStyle = '#64748b';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('尚未进行该任务测验', W / 2, H / 2 + 4);
        }

        ctx.restore();
    }

    function renderPsychologyTable() {
        DOM.analysisTableBody.innerHTML = '';

        TASK_KEYS.forEach(taskId => {
            const task = TASKS[taskId];
            const res = state.completedTasks[taskId];

            const tr = document.createElement('tr');

            let ratingBadge = '<span class="rating-badge fair">待评估</span>';
            if (res) {
                if (res.validRate >= 85 && res.coverage >= 80) {
                    ratingBadge = '<span class="rating-badge excellent">数据质量良好</span>';
                } else if (res.validRate >= 70) {
                    ratingBadge = '<span class="rating-badge good">谨慎解释</span>';
                } else {
                    ratingBadge = '<span class="rating-badge fair">建议重测</span>';
                }
            }

            tr.innerHTML = `
                <td><strong>${task.icon} ${task.name}</strong></td>
                <td>${task.psychology}</td>
                <td>${res ? `${res.duration}s` : '--'}</td>
                <td>${res && res.rmsePx !== null ? `${res.rmsePx}px (${res.degError}°)` : '--'}</td>
                <td>${res ? `<strong>${res.score}分</strong>` : '--'}</td>
                <td>${ratingBadge}</td>
            `;

            DOM.analysisTableBody.appendChild(tr);
        });
    }

    // ==========================================
    // 9. 科研数据导出 (CSV / JSON)
    // ==========================================
    function exportToCSV() {
        if (state.allSessionSamples.length === 0) {
            alert('暂无可导出的时序数据！');
            return;
        }

        let csv = '\uFEFF';
        csv += '# NeuroGaze Lab - 6大几何范式眼动追踪科研数据报表\n';
        csv += '# 实验时间: ' + new Date().toISOString() + '\n';
        csv += '# 被试屏幕视距: ' + CONFIG.screenDistanceCm + ' cm\n';
        csv += '# 屏幕对角线: ' + CONFIG.screenDiagonalIn + ' in\n';
        csv += '# 屏幕持续偏置校正: X ' + state.screenCorrection.x.toFixed(1) + ' px, Y ' + state.screenCorrection.y.toFixed(1) + ' px\n';
        csv += '# 角度值为基于以上自报参数的估计；本系统非医疗器械，不提供临床诊断。\n\n';

        // 1. 各任务汇总表
        csv += 'Task_ID,Task_Name,Duration_s,Target_RMSE_px,Target_RMSE_deg,Median_Error_deg,P95_Error_px,Quality_Index,Coverage_Pct,Valid_Sample_Pct,Estimated_Lag_ms,Target_Velocity_px_s\n';
        TASK_KEYS.forEach(id => {
            const r = state.completedTasks[id];
            if (r) {
                csv += [
                    r.task.id,
                    `"${r.task.name}"`,
                    r.duration,
                    r.rmsePx,
                    r.degError,
                    r.medianDeg,
                    r.p95ErrorPx,
                    r.score,
                    r.coverage,
                    r.validRate,
                    r.lagMs,
                    r.velocity
                ].join(',') + '\n';
            }
        });

        csv += '\n# 原始连续时序采样数据 (Raw Continuous Gaze Stream)\n';
        csv += 'Task_ID,Timestamp_ms,Gaze_Screen_X,Gaze_Screen_Y,WebGazer_Raw_X,WebGazer_Raw_Y,Correction_X,Correction_Y,Arena_X,Arena_Y,Target_X,Target_Y,Path_Progress,Path_Error_Px,Target_Error_Px,Valid,Face_Centered,Eyes_Open,Source_Age_ms\n';

        state.allSessionSamples.forEach(row => {
            csv += [
                row.taskId,
                row.t,
                row.gazeX,
                row.gazeY,
                row.webgazerRawX,
                row.webgazerRawY,
                row.correctionX,
                row.correctionY,
                row.arenaX,
                row.arenaY,
                row.targetX,
                row.targetY,
                row.progress,
                row.errorPx,
                row.targetErrorPx,
                row.valid,
                row.faceCentered,
                row.eyesOpen,
                row.sourceAgeMs
            ].join(',') + '\n';
        });

        downloadFile(csv, `NeuroGaze_6Tasks_Data_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    }

    function exportToJSON() {
        if (state.allSessionSamples.length === 0) {
            alert('暂无可导出的数据！');
            return;
        }

        const obj = {
            system: 'NeuroGaze Lab Multi-Shape Eye-Tracking System',
            timestamp: new Date().toISOString(),
            config: CONFIG,
            sensitivityGain: state.sensitivityGain,
            screenCorrection: state.screenCorrection,
            validation: state.validationResults,
            tasksSummary: state.completedTasks,
            allSamples: state.allSessionSamples
        };

        downloadFile(JSON.stringify(obj, null, 2), `NeuroGaze_6Tasks_Session_${Date.now()}.json`, 'application/json');
    }

    function downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ==========================================
    // 10. 9点精密标定流程
    // ==========================================
    function setupCalibration() {
        state.totalCalibCompleted = 0;
        state.totalCalibSamples = 0;
        state.calibProgress = {};
        state.calibrationComplete = false;
        state.calibrationBusy = false;
        state.calibrationOrderIndex = 0;
        state.webgazerGaze = null;
        state.recentWebgazerPredictions = [];
        state.screenCorrection = { x: 0, y: 0 };
        updateCorrectionDisplay();
        state.filterBuffer = [];
        hideCameraMonitor(true);

        if (typeof webgazer !== 'undefined' && webgazer.clearData) {
            webgazer.clearData().catch(() => {});
        }

        DOM.calibPoints.forEach(pt => {
            const id = pt.getAttribute('data-id');
            state.calibProgress[id] = 0;
            pt.querySelector('span').textContent = '1';
            pt.classList.remove('completed', 'current', 'collecting');

            pt.onclick = () => {
                handleCalibPointClick(id, pt);
            };
        });

        updateCalibrationCurrentPoint();
        updateCalibProgressDisplay();
    }

    const CALIBRATION_ORDER = ['5', '1', '9', '3', '7', '2', '8', '4', '6'];

    function updateCalibrationCurrentPoint() {
        const currentId = CALIBRATION_ORDER[state.calibrationOrderIndex];
        DOM.calibPoints.forEach(pt => pt.classList.toggle('current', pt.getAttribute('data-id') === currentId));
    }

    async function handleCalibPointClick(id, element) {
        if (state.calibrationBusy || id !== CALIBRATION_ORDER[state.calibrationOrderIndex]) return;
        if (!state.faceLocked || !state.faceQuality.eyesOpen || !state.faceQuality.centered) {
            DOM.calibSamplesText.textContent = '请先让面部居中、双眼睁开，再采集此点';
            return;
        }
        state.calibrationBusy = true;
        element.classList.add('collecting');
        element.querySelector('span').textContent = '…';

        const rect = element.getBoundingClientRect();
        const cx = Math.round(rect.left + rect.width / 2);
        const cy = Math.round(rect.top + rect.height / 2);

        let collected = 0;
        let attempts = 0;
        while (collected < CONFIG.calibSamplesPerPoint && attempts < CONFIG.calibSamplesPerPoint * 3) {
            await new Promise(resolve => setTimeout(resolve, attempts === 0 ? 120 : CONFIG.calibSampleIntervalMs));
            attempts++;
            if (state.currentStage !== 'calibration') {
                state.calibrationBusy = false;
                return;
            }
            if (state.faceQuality.centered && state.faceQuality.eyesOpen &&
                typeof webgazer !== 'undefined' && webgazer.recordScreenPosition) {
                webgazer.recordScreenPosition(cx, cy, 'click');
                state.totalCalibSamples++;
                collected++;
            }
        }

        if (collected < CONFIG.calibSamplesPerPoint) {
            element.classList.remove('collecting');
            element.querySelector('span').textContent = '1';
            state.calibrationBusy = false;
            DOM.calibSamplesText.textContent = '本点采样中断：请重新居中面部、睁眼后再次单击';
            return;
        }

        state.calibProgress[id] = CONFIG.calibSamplesPerPoint;
        if (id === '5' && state.recentCameraSamples && state.recentCameraSamples.length > 0) {
            let sumX = 0, sumY = 0;
            state.recentCameraSamples.forEach(s => { sumX += s.x; sumY += s.y; });
            state.baselineCameraX = sumX / state.recentCameraSamples.length;
            state.baselineCameraY = sumY / state.recentCameraSamples.length;
            state.isBaselineCalibrated = true;
        }
        element.querySelector('span').textContent = '✓';
        element.classList.remove('current', 'collecting');
        element.classList.add('completed');
        state.totalCalibCompleted++;
        state.calibrationOrderIndex++;
        state.calibrationBusy = false;

        if (state.totalCalibCompleted >= CALIBRATION_ORDER.length) {
            state.calibrationComplete = true;
            setTimeout(() => switchStage('validation'), 450);
        } else {
            updateCalibrationCurrentPoint();
        }

        updateCalibProgressDisplay();
    }

    function updateCalibProgressDisplay() {
        const pct = Math.round((state.totalCalibCompleted / 9) * 100);
        DOM.calibProgressFill.style.width = `${pct}%`;
        DOM.calibCountText.textContent = `完成度: ${state.totalCalibCompleted} / 9 个标定点 (${pct}%)`;
        DOM.calibSamplesText.textContent = `已采集样本: ${state.totalCalibSamples} 帧`;
    }

    async function startValidationTest() {
        syncMeasurementConfig();
        DOM.btnStartValidation.disabled = true;
        DOM.valAssessment.textContent = '验证中：目标出现后请保持注视，头部不要移动';
        DOM.valAssessment.style.color = 'var(--accent-cyan)';
        DOM.btnSkipToExp.style.display = 'none';
        const target = document.createElement('div');
        target.className = 'validation-target';
        target.setAttribute('aria-hidden', 'true');
        document.body.appendChild(target);

        // 与九点校准坐标错开，避免用训练点验证训练本身。
        const positions = [
            [0.50, 0.27], [0.74, 0.50], [0.50, 0.73], [0.26, 0.50], [0.63, 0.37]
        ];
        const results = [];
        let lastValidationPredictionAt = 0;
        for (let p = 0; p < positions.length; p++) {
            if (state.currentStage !== 'validation') break;
            const x = Math.round(window.innerWidth * positions[p][0]);
            const y = Math.round(window.innerHeight * positions[p][1]);
            target.style.left = `${x}px`;
            target.style.top = `${y}px`;
            DOM.valAssessment.textContent = `验证点 ${p + 1} / ${positions.length}：请持续注视目标中心`;
            await new Promise(resolve => setTimeout(resolve, CONFIG.validationSettleMs));

            const pointSamples = [];
            const expected = Math.floor(CONFIG.validationCollectMs / CONFIG.validationSampleMs);
            for (let i = 0; i < expected; i++) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.validationSampleMs));
                const fresh = state.isSimulated || performance.now() - state.webgazerSampleAt <= CONFIG.gazeStaleMs;
                const isNewPrediction = state.isSimulated || state.webgazerSampleAt > lastValidationPredictionAt;
                if (state.gazeValid && fresh && isNewPrediction) {
                    pointSamples.push({
                        x: state.smoothGaze.x,
                        y: state.smoothGaze.y,
                        errorPx: Math.hypot(state.smoothGaze.x - x, state.smoothGaze.y - y)
                    });
                    if (!state.isSimulated) lastValidationPredictionAt = state.webgazerSampleAt;
                }
            }
            results.push({ targetX: x, targetY: y, expected, samples: pointSamples });
        }
        target.remove();
        if (state.currentStage === 'validation') finishValidation(results);
    }

    function finishValidation(pointResults) {
        const samples = pointResults.flatMap(p => p.samples.map(s => ({ ...s, targetX: p.targetX, targetY: p.targetY })));
        const expected = pointResults.reduce((a, p) => a + p.expected, 0);
        const errors = samples.map(s => s.errorPx);
        const medianPx = median(errors);
        const p95Px = percentile(errors, 0.95);
        const rmsePx = errors.length ? Math.sqrt(errors.reduce((a, v) => a + v * v, 0) / errors.length) : NaN;
        const successive = [];
        pointResults.forEach(p => {
            for (let i = 1; i < p.samples.length; i++) {
                successive.push(Math.hypot(p.samples[i].x - p.samples[i - 1].x, p.samples[i].y - p.samples[i - 1].y));
            }
        });
        const precisionPx = successive.length ? Math.sqrt(successive.reduce((a, v) => a + v * v, 0) / (2 * successive.length)) : NaN;
        const medianDeg = pxToDeg(medianPx);
        const rmseDeg = pxToDeg(rmsePx);
        const precisionDeg = pxToDeg(precisionPx);
        const validRate = expected ? samples.length / expected * 100 : 0;
        const pointBiases = pointResults.filter(p => p.samples.length >= 3).map(p => ({
            x: p.targetX - median(p.samples.map(s => s.x)),
            y: p.targetY - median(p.samples.map(s => s.y))
        }));
        const systematicBiasX = median(pointBiases.map(p => p.x));
        const systematicBiasY = median(pointBiases.map(p => p.y));
        const systematicBiasPx = Math.hypot(systematicBiasX, systematicBiasY);
        const biasSpreadPx = pointBiases.length ? median(pointBiases.map(p =>
            Math.hypot(p.x - systematicBiasX, p.y - systematicBiasY))) : NaN;
        const isConsistentBias = pointBiases.length >= 4 && validRate >= 60 &&
            systematicBiasPx >= 20 && biasSpreadPx <= Math.max(45, systematicBiasPx * 0.5);
        const correctionCandidate = isConsistentBias
            ? addScreenTranslationCorrection(systematicBiasX, systematicBiasY) : null;
        const appliedCorrection = correctionCandidate && Math.hypot(correctionCandidate.x, correctionCandidate.y) >= 1
            ? correctionCandidate : null;

        state.validationDegError = Number.isFinite(rmseDeg) ? rmseDeg : null;
        state.validationResults = {
            medianPx: Number.isFinite(medianPx) ? parseFloat(medianPx.toFixed(1)) : null,
            medianDeg: Number.isFinite(medianDeg) ? parseFloat(medianDeg.toFixed(2)) : null,
            rmsePx: Number.isFinite(rmsePx) ? parseFloat(rmsePx.toFixed(1)) : null,
            rmseDeg: Number.isFinite(rmseDeg) ? parseFloat(rmseDeg.toFixed(2)) : null,
            p95Px: Number.isFinite(p95Px) ? parseFloat(p95Px.toFixed(1)) : null,
            precisionRmsS2SPx: Number.isFinite(precisionPx) ? parseFloat(precisionPx.toFixed(1)) : null,
            precisionRmsS2SDeg: Number.isFinite(precisionDeg) ? parseFloat(precisionDeg.toFixed(2)) : null,
            validRate: parseFloat(validRate.toFixed(1)),
            systematicBiasPx: Number.isFinite(systematicBiasPx) ? parseFloat(systematicBiasPx.toFixed(1)) : null,
            systematicBiasX: Number.isFinite(systematicBiasX) ? parseFloat(systematicBiasX.toFixed(1)) : null,
            systematicBiasY: Number.isFinite(systematicBiasY) ? parseFloat(systematicBiasY.toFixed(1)) : null,
            biasSpreadPx: Number.isFinite(biasSpreadPx) ? parseFloat(biasSpreadPx.toFixed(1)) : null,
            appliedCorrection: appliedCorrection ? {
                x: parseFloat(appliedCorrection.x.toFixed(1)),
                y: parseFloat(appliedCorrection.y.toFixed(1))
            } : null,
            requiresRevalidation: Boolean(appliedCorrection),
            points: pointResults
        };

        DOM.valDegVal.textContent = Number.isFinite(rmseDeg) ? rmseDeg.toFixed(2) + '°' : '--';
        DOM.valMedian.textContent = Number.isFinite(medianDeg) ? medianDeg.toFixed(2) + '°' : '--';
        DOM.valPrecision.textContent = Number.isFinite(precisionDeg) ? precisionDeg.toFixed(2) + '°' : '--';
        DOM.valValidRate.textContent = `${validRate.toFixed(0)}%`;
        DOM.btnStartValidation.disabled = false;
        DOM.btnStartValidation.textContent = appliedCorrection ? '再次验证自动校正结果' : '重新进行 5 点验证';
        DOM.btnSkipToExp.style.display = appliedCorrection ? 'none' : 'inline-block';

        if (appliedCorrection) {
            const xText = `${appliedCorrection.x >= 0 ? '+' : ''}${Math.round(appliedCorrection.x)}px`;
            const yText = `${appliedCorrection.y >= 0 ? '+' : ''}${Math.round(appliedCorrection.y)}px`;
            DOM.valAssessment.textContent = `已识别并修正稳定偏置（X ${xText}，Y ${yText}）。请点击“再次验证”确认校正后的真实误差。`;
            DOM.valAssessment.style.color = 'var(--accent-yellow)';
            DOM.valMeterCircle.style.borderColor = 'var(--accent-yellow)';
        } else if (validRate < 60 || !Number.isFinite(rmseDeg)) {
            DOM.valAssessment.textContent = '⚠️ 有效样本不足：请改善光照、减少头动并重新校准。当前结果不宜解释。';
            DOM.valAssessment.style.color = 'var(--accent-red)';
            DOM.valMeterCircle.style.borderColor = 'var(--accent-red)';
        } else if (medianDeg <= 2.0 && precisionDeg <= 1.0) {
            DOM.valAssessment.textContent = '✅ 当前数据质量良好，可进入追踪任务；实验中仍会逐帧剔除眨眼与头位偏移。';
            DOM.valAssessment.style.color = 'var(--accent-green)';
            DOM.valMeterCircle.style.borderColor = 'var(--accent-green)';
        } else if (medianDeg <= 4.0 && validRate >= 75) {
            DOM.valAssessment.textContent = '△ 数据可用于粗粒度区域/轨迹演示，不建议解释细小注视差异。';
            DOM.valAssessment.style.color = 'var(--accent-cyan)';
            DOM.valMeterCircle.style.borderColor = 'var(--accent-cyan)';
        } else {
            DOM.valAssessment.textContent = '⚠️ 误差较大，建议重新校准；继续实验时仅作交互演示，不作能力判断。';
            DOM.valAssessment.style.color = 'var(--accent-yellow)';
            DOM.valMeterCircle.style.borderColor = 'var(--accent-yellow)';
        }
    }

    // ==========================================
    // 11. 事件绑定
    // ==========================================
    function bindEvents() {
        // 启动并直接开始实验
        DOM.btnQuickPlay.addEventListener('click', async () => {
            await initEyeTracking();
            setTimeout(() => {
                switchStage('experiment');
                recenterToGaze();
            }, 800);
        });

        // 9点标定流程
        DOM.btnStartInit.addEventListener('click', async () => {
            await initEyeTracking();
            setupCalibration();
            switchStage('calibration');
        });

        DOM.btnSkipCalibDirect.addEventListener('click', () => {
            switchStage('experiment');
            recenterToGaze();
        });

        DOM.btnUseSimulated.addEventListener('click', () => {
            enableSimulatedGaze();
            switchStage('experiment');
        });

        DOM.btnStartValidation.addEventListener('click', startValidationTest);
        DOM.btnSkipToExp.addEventListener('click', () => switchStage('experiment'));
        DOM.btnRecalibNow.addEventListener('click', () => {
            setupCalibration();
            switchStage('calibration');
        });

        // 6大任务切换 Tab
        DOM.taskTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const taskId = btn.getAttribute('data-task');
                loadTask(taskId);
            });
        });

        // 实验 HUD 按钮
        DOM.btnResetTask.addEventListener('click', resetCurrentTask);
        DOM.btnNextTask.addEventListener('click', proceedToNextTask);
        DOM.btnFinishAllTasks.addEventListener('click', () => switchStage('results'));

        // 单任务完成弹窗按钮
        DOM.btnProceedNext.addEventListener('click', proceedToNextTask);
        DOM.btnReplayTask.addEventListener('click', resetCurrentTask);
        DOM.btnViewSummary.addEventListener('click', () => switchStage('results'));

        // 灵敏度增益滑动条
        DOM.gainSlider.addEventListener('input', (e) => {
            state.sensitivityGain = parseFloat(e.target.value);
            DOM.gainVal.textContent = `${state.sensitivityGain.toFixed(1)}x`;
        });

        // 独立水平开合范围滑动条 (左右边缘轻松可达)
        if (DOM.gainXSlider) {
            DOM.gainXSlider.addEventListener('input', (e) => {
                state.horizontalGainRatio = parseFloat(e.target.value);
                if (DOM.gainXVal) {
                    DOM.gainXVal.textContent = `${state.horizontalGainRatio.toFixed(1)}x`;
                }
            });
        }

        // 独立垂直增益滑动条
        if (DOM.gainYSlider) {
            DOM.gainYSlider.addEventListener('input', (e) => {
                state.verticalGainRatio = parseFloat(e.target.value);
                if (DOM.gainYVal) {
                    DOM.gainYVal.textContent = `${state.verticalGainRatio.toFixed(1)}x`;
                }
            });
        }

        // 滤波抗噪平滑度滑动条
        if (DOM.smoothSlider) {
            DOM.smoothSlider.addEventListener('input', (e) => {
                state.smoothLevel = parseInt(e.target.value, 10);
                const labels = {
                    1: '极速跟随',
                    2: '轻度平滑',
                    3: '平衡(推荐)',
                    4: '稳健抗抖',
                    5: '超强稳态消抖'
                };
                if (DOM.smoothVal) {
                    DOM.smoothVal.textContent = labels[state.smoothLevel] || `${state.smoothLevel}档`;
                }
            });
        }

        // 监控视窗展开与折叠隐藏事件
        if (DOM.btnToggleCamMonitor) {
            DOM.btnToggleCamMonitor.addEventListener('click', () => hideCameraMonitor(false));
        }
        if (DOM.btnReopenCamMonitor) {
            DOM.btnReopenCamMonitor.addEventListener('click', showCameraMonitor);
        }
        if (DOM.btnToggleCamTop) {
            DOM.btnToggleCamTop.addEventListener('click', toggleCameraMonitor);
        }

        // 空格键中心对齐与清空漂移
        DOM.btnRecenterZero.addEventListener('click', recenterToGaze);
        DOM.btnClearDrift.addEventListener('click', clearAllDrift);

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                recenterToGaze();
            }
        });

        // 控制模式
        DOM.controlModeSelect.addEventListener('change', (e) => {
            state.controlMode = e.target.value;
        });

        // 视线红点开关
        DOM.btnToggleDot.addEventListener('click', () => {
            state.showGazeDot = !state.showGazeDot;
            DOM.btnToggleDot.textContent = state.showGazeDot ? '🔴 视线红点' : '⚪ 隐藏红点';
            DOM.liveCursor.style.display = state.showGazeDot ? 'block' : 'none';
        });

        // 导出与重开
        DOM.btnExportCsv.addEventListener('click', exportToCSV);
        DOM.btnExportJson.addEventListener('click', exportToJSON);
        DOM.btnRestartAll.addEventListener('click', () => {
            state.completedTasks = {};
            state.allSessionSamples = [];
            DOM.taskTabBtns.forEach(b => b.classList.remove('completed-tab'));
            switchStage('intro');
        });

        window.addEventListener('resize', () => {
            if (state.currentStage === 'experiment') {
                initTaskArena();
                loadTask(state.currentTaskId);
            }
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        bindEvents();
    });

})();
