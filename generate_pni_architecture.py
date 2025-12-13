#!/usr/bin/env python3
"""
生成 PNI 架构图
使用 matplotlib 绘制网络架构图
"""

import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.lines as mlines

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False

# 创建图形
fig, ax = plt.subplots(1, 1, figsize=(16, 12))
ax.set_xlim(0, 10)
ax.set_ylim(0, 12)
ax.axis('off')

# 颜色定义
color_tencent = '#00a4ff'
color_linode = '#ffe66d'
color_drt = '#ff6b6b'
color_vpn = '#4ecdc4'

# 绘制腾讯云区域
tencent_box = FancyBboxPatch((0.5, 8), 2.5, 3,
                              boxstyle="round,pad=0.1",
                              facecolor=color_tencent,
                              edgecolor='black',
                              linewidth=2,
                              alpha=0.3)
ax.add_patch(tencent_box)
ax.text(1.75, 10.7, 'Teng Xun Yun Frankfurt VPC',
        ha='center', va='center', fontsize=11, weight='bold')
ax.text(1.75, 10.3, 'FRA14 (DGT)',
        ha='center', va='center', fontsize=9, style='italic')

# 腾讯云组件
vpc_box = FancyBboxPatch((0.7, 9.5), 2.1, 0.6,
                          boxstyle="round,pad=0.05",
                          facecolor='white',
                          edgecolor='black',
                          linewidth=1)
ax.add_patch(vpc_box)
ax.text(1.75, 9.8, 'VPC\n192.168.0.0/16',
        ha='center', va='center', fontsize=8)

cvm_box = FancyBboxPatch((0.7, 8.7), 2.1, 0.6,
                          boxstyle="round,pad=0.05",
                          facecolor='white',
                          edgecolor='black',
                          linewidth=1)
ax.add_patch(cvm_box)
ax.text(1.75, 9.0, 'CVM Instances\n192.168.1.0/24',
        ha='center', va='center', fontsize=8)

dcg_box = FancyBboxPatch((0.7, 8.2), 2.1, 0.4,
                          boxstyle="round,pad=0.05",
                          facecolor='lightblue',
                          edgecolor='black',
                          linewidth=1)
ax.add_patch(dcg_box)
ax.text(1.75, 8.4, 'Zhuan Xian Wang Guan\nDirect Connect Gateway',
        ha='center', va='center', fontsize=7)

# DRT 数据中心区域
drt_box = FancyBboxPatch((3.5, 8), 3, 3,
                          boxstyle="round,pad=0.1",
                          facecolor=color_drt,
                          edgecolor='black',
                          linewidth=2,
                          alpha=0.3)
ax.add_patch(drt_box)
ax.text(5, 10.7, 'DGT Frankfurt Data Center',
        ha='center', va='center', fontsize=11, weight='bold')
ax.text(5, 10.3, 'DRT Physical Line',
        ha='center', va='center', fontsize=9, style='italic')

# DRT 路由器
router_box = FancyBboxPatch((4, 9.3), 2, 0.7,
                             boxstyle="round,pad=0.05",
                             facecolor='white',
                             edgecolor='black',
                             linewidth=1)
ax.add_patch(router_box)
ax.text(5, 9.65, 'DGT Core Router\nVLAN 100',
        ha='center', va='center', fontsize=8)

# 物理专线
physical_box = FancyBboxPatch((4, 8.4), 2, 0.7,
                               boxstyle="round,pad=0.05",
                               facecolor='lightyellow',
                               edgecolor='black',
                               linewidth=1)
ax.add_patch(physical_box)
ax.text(5, 8.75, 'Wu Li Zhuan Xian\n1Gbps/10Gbps\nFRA14 <-> FRA10',
        ha='center', va='center', fontsize=7)

# VPN 隧道层
vpn_box = FancyBboxPatch((3.5, 6), 3, 1.5,
                          boxstyle="round,pad=0.1",
                          facecolor=color_vpn,
                          edgecolor='black',
                          linewidth=2,
                          alpha=0.3)
ax.add_patch(vpn_box)
ax.text(5, 7.3, 'VPN Sui Dao Ceng',
        ha='center', va='center', fontsize=10, weight='bold')

wg_box = FancyBboxPatch((4, 6.3), 2, 0.8,
                         boxstyle="round,pad=0.05",
                         facecolor='white',
                         edgecolor='black',
                         linewidth=1)
ax.add_patch(wg_box)
ax.text(5, 6.7, 'WireGuard Tunnel\n172.16.0.0/30\nUDP 51820',
        ha='center', va='center', fontsize=7)

# Linode 区域
linode_box = FancyBboxPatch((7, 8), 2.5, 3,
                             boxstyle="round,pad=0.1",
                             facecolor=color_linode,
                             edgecolor='black',
                             linewidth=2,
                             alpha=0.3)
ax.add_patch(linode_box)
ax.text(8.25, 10.7, 'Linode Frankfurt',
        ha='center', va='center', fontsize=11, weight='bold')
ax.text(8.25, 10.3, 'FRA10 (DGT)',
        ha='center', va='center', fontsize=9, style='italic')

# Linode Gateway
gw1_box = FancyBboxPatch((7.2, 9.5), 2.1, 0.6,
                          boxstyle="round,pad=0.05",
                          facecolor='white',
                          edgecolor='black',
                          linewidth=1)
ax.add_patch(gw1_box)
ax.text(8.25, 9.8, 'Gateway Node 1\nVLAN: 10.0.0.1/24',
        ha='center', va='center', fontsize=7)

gw2_box = FancyBboxPatch((7.2, 8.8), 2.1, 0.5,
                          boxstyle="round,pad=0.05",
                          facecolor='lightgray',
                          edgecolor='black',
                          linewidth=1,
                          linestyle='dashed')
ax.add_patch(gw2_box)
ax.text(8.25, 9.05, 'Gateway Node 2 (Bei Fen)\nVLAN: 10.0.0.2/24',
        ha='center', va='center', fontsize=6)

# Linode VLAN
vlan_box = FancyBboxPatch((7.2, 8.2), 2.1, 0.4,
                           boxstyle="round,pad=0.05",
                           facecolor='lightyellow',
                           edgecolor='black',
                           linewidth=1)
ax.add_patch(vlan_box)
ax.text(8.25, 8.4, 'Private VLAN\n10.0.0.0/16',
        ha='center', va='center', fontsize=7)

# 绘制连接线
# 腾讯云内部连接
ax.annotate('', xy=(1.75, 9.5), xytext=(1.75, 9.3),
            arrowprops=dict(arrowstyle='->', lw=2, color='black'))
ax.annotate('', xy=(1.75, 8.7), xytext=(1.75, 8.6),
            arrowprops=dict(arrowstyle='->', lw=2, color='black'))

# 腾讯云到 DRT
ax.annotate('BGP Peering', xy=(4, 9.65), xytext=(3, 8.4),
            arrowprops=dict(arrowstyle='->', lw=3, color='red'),
            fontsize=8, ha='center')

# DRT 到 Linode
ax.annotate('Static Route', xy=(7, 9.65), xytext=(6, 9.0),
            arrowprops=dict(arrowstyle='->', lw=3, color='blue'),
            fontsize=8, ha='center')

# Gateway 高可用
ax.annotate('', xy=(8.25, 9.5), xytext=(8.25, 9.3),
            arrowprops=dict(arrowstyle='<->', lw=1.5, color='green', linestyle='dashed'))
ax.text(8.7, 9.4, 'VRRP', fontsize=6, color='green')

# VPN 隧道连接
ax.annotate('', xy=(5, 8.4), xytext=(5, 7.1),
            arrowprops=dict(arrowstyle='<->', lw=3, color=color_vpn))
ax.annotate('', xy=(8.25, 9.5), xytext=(6, 7.1),
            arrowprops=dict(arrowstyle='<->', lw=3, color=color_vpn))

# Linode 内部连接
ax.annotate('', xy=(8.25, 8.8), xytext=(8.25, 8.6),
            arrowprops=dict(arrowstyle='->', lw=2, color='black'))

# 添加图例和说明
ax.text(5, 11.5, 'PNI Architecture: Layer 2 Private Network Interconnect',
        ha='center', va='center', fontsize=14, weight='bold')
ax.text(5, 0.8, 'Mu Di: Er Ceng Si Wang Da Tong, Liu Liang Bu Zou Gong Wang',
        ha='center', va='center', fontsize=10, style='italic')
ax.text(5, 0.3, 'FRA10 (Linode) <-- DRT Physical Line --> FRA14 (Teng Xun Yun)',
        ha='center', va='center', fontsize=9)

# 添加图例
legend_elements = [
    mlines.Line2D([], [], color=color_tencent, marker='s', linestyle='None',
                  markersize=10, label='Teng Xun Yun'),
    mlines.Line2D([], [], color=color_linode, marker='s', linestyle='None',
                  markersize=10, label='Linode'),
    mlines.Line2D([], [], color=color_drt, marker='s', linestyle='None',
                  markersize=10, label='DRT Physical Line'),
    mlines.Line2D([], [], color=color_vpn, marker='s', linestyle='None',
                  markersize=10, label='VPN Tunnel'),
]
ax.legend(handles=legend_elements, loc='upper left', fontsize=9)

# 添加关键信息框
info_box = FancyBboxPatch((0.5, 1.5), 4, 4,
                           boxstyle="round,pad=0.1",
                           facecolor='lightyellow',
                           edgecolor='black',
                           linewidth=1,
                           alpha=0.5)
ax.add_patch(info_box)
ax.text(2.5, 5.2, 'Guan Jian Xin Xi (Key Information)',
        ha='center', va='center', fontsize=10, weight='bold')

info_text = """
• Mu Di: Er Ceng Si Wang Da Tong
• Liu Liang: Wan Quan Bu Zou Gong Wang
• Yan Chi: < 3ms
• Dai Kuan: 1-10Gbps
• Fang An: WireGuard VPN + DRT Physical Line

Wu Li Zhuan Xian:
• Gong Ying Shang: DRT (Deutsche Rechenzentren Technik)
• Yuan Ji Fang: FRA10 (Linode)
• Mu Biao Ji Fang: FRA14 (Teng Xun Yun)
• Lian Jie Lei Xing: Campus Cross Connect
• Wu Li Ju Li: < 500m
• Yue Fei: ~$100-250 USD
"""

ax.text(2.5, 3.2, info_text,
        ha='center', va='center', fontsize=7,
        family='monospace', linespacing=1.5)

# 保存图片
plt.tight_layout()
plt.savefig('/home/ccp/PNI_Architecture.png', dpi=300, bbox_inches='tight')
print("架构图已生成: /home/ccp/PNI_Architecture.png")
