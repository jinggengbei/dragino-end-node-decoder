const fs = require('fs');
const path = require('path');

const BASE_DIR = '/root/.openclaw/workspace/dragino-end-node-decoder';

// 已转换设备（跳过）
const SKIP_DEVICES = ['PB01', 'LHT52', 'LDS03A', 'CS01-LB', 'LHT65N', 'LTC2', 'LDS02', 'TrackerD', 'TS01-LB', 'UV254-LB', 'N720-SX'];

// 辅助函数模板
const HELPER_FUNCTIONS = `
function getzf(c_num){ 
    if(parseInt(c_num) < 10)
        c_num = '0' + c_num; 
    return c_num; 
}

function getMyDate(str){ 
    var c_Date;
    if(str > 9999999999)
        c_Date = new Date(parseInt(str));
    else 
        c_Date = new Date(parseInt(str) * 1000);
    
    var c_Year = c_Date.getFullYear(), 
    c_Month = c_Date.getMonth()+1, 
    c_Day = c_Date.getDate(),
    c_Hour = c_Date.getHours(), 
    c_Min = c_Date.getMinutes(), 
    c_Sen = c_Date.getSeconds();
    var c_Time = c_Year +'-'+ getzf(c_Month) +'-'+ getzf(c_Day) +' '+ getzf(c_Hour) +':'+ getzf(c_Min) +':'+getzf(c_Sen); 
    
    return c_Time;
}
`;

// 获取设备目录
function getDeviceDirs() {
    const dirs = fs.readdirSync(BASE_DIR).filter(item => {
        const itemPath = path.join(BASE_DIR, item);
        return fs.statSync(itemPath).isDirectory() && !SKIP_DEVICES.includes(item);
    });
    return dirs;
}

// 查找解码器文件
function findDecoderFile(deviceDir) {
    const files = fs.readdirSync(deviceDir);
    const decoderFiles = files.filter(f => f.endsWith('.txt') && !f.includes('_decoder.txt'));
    if (decoderFiles.length > 0) {
        return path.join(deviceDir, decoderFiles[0]);
    }
    return null;
}

// 读取原始文件
function readOriginalFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

// 转换解码器为统一格式
function convertToUnifiedFormat(originalContent, deviceName) {
    // 检查是否已经是统一格式
    if (originalContent.includes('function decodeUplink(input)')) {
        return originalContent;
    }
    
    let converted = originalContent;
    
    // 替换函数签名：function Decoder(bytes, port) -> function decodeUplink(input)
    converted = converted.replace(/function\s+Decoder\s*\(\s*bytes\s*,\s*port\s*\)/g, 'function decodeUplink(input) {\n    var port = input.fPort;\n    var bytes = input.bytes;');
    
    // 替换 return 语句：return { ... } -> return { data: { ... } }
    // 这个需要更复杂的处理，我们先做基本的转换
    
    // 添加辅助函数（如果不存在）
    if (!converted.includes('function getzf')) {
        converted = HELPER_FUNCTIONS + '\n' + converted;
    }
    
    return converted;
}

// 保存转换后的文件
function saveConvertedFile(deviceDir, deviceName, content) {
    const outputPath = path.join(deviceDir, `${deviceName}_decoder.txt`);
    fs.writeFileSync(outputPath, content);
    return outputPath;
}

// 主函数
function main() {
    const deviceDirs = getDeviceDirs();
    const convertedDevices = [];
    const skippedDevices = [];
    const errorDevices = [];
    
    console.log(`找到 ${deviceDirs.length} 个需要处理的设备目录`);
    console.log(`跳过 ${SKIP_DEVICES.length} 个已转换设备: ${SKIP_DEVICES.join(', ')}`);
    console.log('---');
    
    for (const deviceDir of deviceDirs) {
        const devicePath = path.join(BASE_DIR, deviceDir);
        const decoderFile = findDecoderFile(devicePath);
        
        if (!decoderFile) {
            console.log(`⚠️  ${deviceDir}: 未找到解码器文件`);
            skippedDevices.push(deviceDir);
            continue;
        }
        
        try {
            const originalContent = readOriginalFile(decoderFile);
            const convertedContent = convertToUnifiedFormat(originalContent, deviceDir);
            const outputPath = saveConvertedFile(devicePath, deviceDir, convertedContent);
            
            console.log(`✅ ${deviceDir}: 已转换 -> ${path.basename(outputPath)}`);
            convertedDevices.push(deviceDir);
        } catch (error) {
            console.log(`❌ ${deviceDir}: 转换失败 - ${error.message}`);
            errorDevices.push(deviceDir);
        }
    }
    
    console.log('---');
    console.log(`转换完成:`);
    console.log(`  ✅ 成功: ${convertedDevices.length}`);
    console.log(`  ⚠️  跳过: ${skippedDevices.length}`);
    console.log(`  ❌ 失败: ${errorDevices.length}`);
    
    if (convertedDevices.length > 0) {
        console.log('\n已转换设备列表:');
        convertedDevices.forEach(d => console.log(`  - ${d}`));
    }
    
    return convertedDevices;
}

main();
