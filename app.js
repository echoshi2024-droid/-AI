// 买菜记账 - 核心逻辑

let selectedImages = [];
let recognizedAmounts = [];

// DOM 元素
const imageInput = document.getElementById('imageInput');
const previewSection = document.getElementById('previewSection');
const processSection = document.getElementById('processSection');
const processBtn = document.getElementById('processBtn');
const loadingSection = document.getElementById('loadingSection');
const loadingText = document.getElementById('loadingText');
const progressText = document.getElementById('progressText');
const resultSection = document.getElementById('resultSection');
const amountList = document.getElementById('amountList');
const totalAmount = document.getElementById('totalAmount');
const resetBtn = document.getElementById('resetBtn');
const errorSection = document.getElementById('errorSection');
const errorText = document.getElementById('errorText');
const retryBtn = document.getElementById('retryBtn');

// 初始化事件监听
imageInput.addEventListener('change', handleImageSelect);
processBtn.addEventListener('click', processImages);
resetBtn.addEventListener('click', resetApp);
retryBtn.addEventListener('click', resetApp);

// 处理图片选择
function handleImageSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    selectedImages = files;
    showPreview(files);
    processSection.style.display = 'block';
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
}

// 显示图片预览
function showPreview(files) {
    previewSection.innerHTML = '';
    
    if (files.length > 1) {
        const countBadge = document.createElement('div');
        countBadge.className = 'preview-count';
        countBadge.textContent = files.length;
        previewSection.appendChild(countBadge);
    }
    
    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const item = document.createElement('div');
            item.className = 'preview-item';
            item.innerHTML = `<img src="${e.target.result}" alt="预览${index + 1}">`;
            previewSection.appendChild(item);
        };
        reader.readAsDataURL(file);
    });
}

// 处理图片识别
async function processImages() {
    if (selectedImages.length === 0) return;
    
    // 显示加载状态
    processSection.style.display = 'none';
    loadingSection.style.display = 'block';
    errorSection.style.display = 'none';
    recognizedAmounts = [];
    
    try {
        loadingText.textContent = '正在初始化识别引擎...';
        progressText.textContent = '可能需要 10-30 秒（首次加载语言包）';
        
        // 创建 Tesseract worker，设置超时
        const worker = await Tesseract.createWorker({
            logger: m => {
                if (m.status === 'recognizing text') {
                    progressText.textContent = `识别进度：${Math.round(m.progress * 100)}%`;
                } else if (m.status === 'loading tesseract core') {
                    progressText.textContent = '正在加载识别引擎...';
                } else if (m.status === 'initializing api') {
                    progressText.textContent = '正在初始化...';
                } else {
                    progressText.textContent = m.status;
                }
            },
            errorHandler: err => {
                console.error('Tesseract 错误:', err);
            }
        });
        
        // 加载中文语言包（带超时）
        loadingText.textContent = '正在加载中文识别包...';
        try {
            await worker.loadLanguage('chi_sim');
            await worker.initialize('chi_sim');
            loadingText.textContent = '中文包加载成功，开始识别...';
        } catch (langError) {
            console.warn('中文包加载失败，尝试英文包:', langError);
            loadingText.textContent = '中文包加载慢，尝试通用识别...';
            // 降级方案：不加载语言包，直接识别
            await worker.initialize('eng');
        }
        
        // 逐张识别图片
        for (let i = 0; i < selectedImages.length; i++) {
            const file = selectedImages[i];
            loadingText.textContent = `正在识别第 ${i + 1}/${selectedImages.length} 张图片...`;
            
            const result = await worker.recognize(file);
            console.log(`图片 ${i + 1} 识别结果:`, result.data.text);
            const amounts = extractAmounts(result.data.text, file.name);
            recognizedAmounts.push(...amounts);
        }
        
        await worker.terminate();
        
        // 显示结果
        showResults();
        
    } catch (error) {
        console.error('识别失败:', error);
        showError(`识别失败：${error.message || '未知错误'}`);
    }
}

// 从文本中提取金额
function extractAmounts(text, filename) {
    const amounts = [];
    
    // 匹配金额模式：
    // 1. ¥123.45 或 ￥123.45
    // 2. 123.45 元
    // 3. 123.45（纯数字，带小数点）
    const patterns = [
        /[¥￥]\s*(\d+\.?\d*)/g,      // ¥123.45 或 ￥123.45
        /(\d+\.?\d*)\s*元/g,         // 123.45 元
        /转账金额.*?(\d+\.?\d*)/g,   // 转账金额 XXX
        /收款.*?(\d+\.?\d*)/g,       // 收款 XXX
    ];
    
    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const amount = parseFloat(match[1]);
            if (!isNaN(amount) && amount > 0 && amount < 100000) {
                // 避免重复添加
                if (!amounts.find(a => Math.abs(a.value - amount) < 0.01)) {
                    amounts.push({
                        value: amount,
                        source: filename
                    });
                }
            }
        }
    });
    
    // 如果没有匹配到特定模式，尝试找纯数字（可能是金额）
    if (amounts.length === 0) {
        const numberPattern = /(\d+\.\d{2})/g;
        let match;
        while ((match = numberPattern.exec(text)) !== null) {
            const amount = parseFloat(match[1]);
            if (!isNaN(amount) && amount > 0 && amount < 100000) {
                amounts.push({
                    value: amount,
                    source: filename
                });
            }
        }
    }
    
    return amounts;
}

// 显示识别结果
function showResults() {
    loadingSection.style.display = 'none';
    resultSection.style.display = 'block';
    
    if (recognizedAmounts.length === 0) {
        amountList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">未识别到金额，请尝试重新上传清晰的截图</p>';
        totalAmount.textContent = '¥0.00';
        return;
    }
    
    // 显示金额列表
    amountList.innerHTML = recognizedAmounts.map((item, index) => `
        <div class="amount-item">
            <span class="source">图片${index + 1}</span>
            <span class="value">¥${item.value.toFixed(2)}</span>
        </div>
    `).join('');
    
    // 计算总额
    const total = recognizedAmounts.reduce((sum, item) => sum + item.value, 0);
    totalAmount.textContent = `¥${total.toFixed(2)}`;
}

// 显示错误
function showError(message) {
    loadingSection.style.display = 'none';
    errorSection.style.display = 'block';
    errorText.textContent = message;
}

// 重置应用
function resetApp() {
    selectedImages = [];
    recognizedAmounts = [];
    imageInput.value = '';
    previewSection.innerHTML = '';
    processSection.style.display = 'none';
    loadingSection.style.display = 'none';
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    progressText.textContent = '';
}

// 页面加载完成提示
console.log('🥬 买菜记账 已加载');
