/**
 * 格式化时间戳为指定格式 "25-10-24 上午 8:50"
 */
export const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    const year = date.getFullYear().toString().slice(-2) // 年份后两位
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    
    // 判断上午/下午
    const period = hours < 12 ? '上午' : '下午'
    const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours)
    
    return `${year}-${month}-${day} ${period} ${displayHour}:${minutes}`
}

