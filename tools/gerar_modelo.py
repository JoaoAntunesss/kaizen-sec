"""Gera modelo-kaizen.xlsx: o modelo de Excel que a app preenche ao exportar.
Folhas de dados em Tabelas do Excel (com filtros) + folha Painel com fórmulas e gráficos ligados.
Correr: python3 tools/gerar_modelo.py"""
import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.shapes import GraphicalProperties

AZUL = "1F4E79"; EST = ["EB6834", "2A78D6", "EDA100", "1BAF7A"]; ESTADOS = ["A fazer", "Em curso", "Pendente", "Concluído"]
N = 60  # linhas de exemplo; a app reescreve os dados e acerta os intervalos
wb = Workbook()
pn = wb.active; pn.title = "Painel"
re_ = wb.create_sheet("Reuniões"); ta = wb.create_sheet("Tarefas"); pr = wb.create_sheet("Presenças")
cab = Font(bold=True, color="FFFFFF"); fcab = PatternFill("solid", fgColor=AZUL)
DATA = "dd/mm/yyyy"; PCT = "0%"

def tabela(ws, nome, cols, larg, fmts, exemplo):
    ws.append(cols)
    ws.append(exemplo)
    for i, w in enumerate(larg, 1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = w
        if fmts[i - 1]: ws.cell(2, i).number_format = fmts[i - 1]
    ws.freeze_panes = "A2"
    t = Table(displayName=nome, ref=f"A1:{ws.cell(1, len(cols)).column_letter}2")
    t.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
    ws.add_table(t)

hoje = dt.date(2026, 11, 16)
tabela(re_, "tReunioes", ["Data", "Semana", "Presentes", "Equipa", "% Presença", *ESTADOS, "Em atraso", "Apontamentos", "Convidados"],
       [12, 9, 11, 9, 12, 10, 10, 10, 11, 11, 60, 30], [DATA, None, None, None, PCT] + [None] * 7,
       [hoje, 47, 6, 8, 0.75, 1, 0, 0, 1, 1, "", ""])
tabela(ta, "tTarefas", ["Reunião", "Tarefa", "Responsável", "Prazo", "Estado", "Em atraso"],
       [12, 60, 20, 12, 12, 10], [DATA, None, None, DATA, None, None], [hoje, "Exemplo", "João", hoje, "A fazer", "Não"])
tabela(pr, "tPresencas", ["Reunião", "N.º mecanográfico", "Nome", "Presença"],
       [12, 18, 26, 14], [DATA, None, None, None], [hoje, "4523", "João Antunes", "Presente"])

# ---------------- Painel ----------------
pn.sheet_view.showGridLines = False
pn.column_dimensions["A"].width = 24
for c in "BCDEFG": pn.column_dimensions[c].width = 13
pn["A1"] = "Painel Kaizen — Secretaria da Conservação"; pn["A1"].font = Font(bold=True, size=16, color=AZUL)
pn["A2"] = "Tudo nesta folha é calculado a partir das folhas Reuniões, Tarefas e Presenças. Se alterar os dados, os gráficos atualizam."
pn["A2"].font = Font(italic=True, color="555555")
kpis = [("Última reunião", "=MAX('Reuniões'!A:A)", DATA), ("Reuniões", "=COUNT('Reuniões'!A:A)", None),
        ("Presença média", "=IFERROR(AVERAGE('Reuniões'!E:E),\"\")", PCT),
        ("Por fechar (última reunião)", '=COUNTIFS(Tarefas!A:A,$B$4,Tarefas!E:E,"<>Concluído")', None),
        ("Em atraso (última reunião)", '=COUNTIFS(Tarefas!A:A,$B$4,Tarefas!F:F,"Sim")', None)]
for i, (l, f, fmt) in enumerate(kpis):
    r = 4 + i
    pn.cell(r, 1, l).font = Font(color="333333")
    c = pn.cell(r, 2, f); c.font = Font(bold=True, size=12, color=AZUL)
    if fmt: c.number_format = fmt

def cab_linha(r, vals):
    for j, v in enumerate(vals):
        c = pn.cell(r, 1 + j, v); c.font = cab; c.fill = fcab; c.alignment = Alignment(horizontal="center" if j else "left")

# Estado das tarefas na última reunião (A11:B14)
pn["A10"] = "Estado das tarefas (última reunião)"; pn["A10"].font = Font(bold=True, size=12)
cab_linha(11, ["Estado", "Tarefas"])
for i, e in enumerate(ESTADOS):
    pn.cell(12 + i, 1, e); pn.cell(12 + i, 2, f'=COUNTIFS(Tarefas!$A:$A,$B$4,Tarefas!$E:$E,A{12+i})')

# Tarefas por responsável (A19:E38) — a app escreve os nomes
pn["A18"] = "Tarefas por responsável (última reunião)"; pn["A18"].font = Font(bold=True, size=12)
cab_linha(19, ["Responsável", *ESTADOS])
for r in range(20, 20 + 20):
    pn.cell(r, 1, "Exemplo" if r == 20 else None)
    for j in range(4):
        col = "BCDE"[j]
        pn.cell(r, 2 + j, f'=IF($A{r}="","",COUNTIFS(Tarefas!$A:$A,$B$4,Tarefas!$C:$C,$A{r},Tarefas!$E:$E,{col}$19))')

# Assiduidade (A43:E62) — a app escreve n.º e nome
pn["A42"] = "Assiduidade por pessoa"; pn["A42"].font = Font(bold=True, size=12)
cab_linha(43, ["Nome", "N.º", "Presenças", "Reuniões", "% Assiduidade"])
for r in range(44, 44 + 20):
    pn.cell(r, 1, "Exemplo" if r == 44 else None); pn.cell(r, 2, "4523" if r == 44 else None)
    pn.cell(r, 3, f'=IF($B{r}="","",COUNTIFS(\'Presenças\'!$B:$B,$B{r},\'Presenças\'!$D:$D,"Presente"))')
    pn.cell(r, 4, f'=IF($B{r}="","",COUNTIFS(\'Presenças\'!$B:$B,$B{r}))')
    c = pn.cell(r, 5, f'=IF(OR($B{r}="",D{r}=0),"",C{r}/D{r})'); c.number_format = PCT

def estilo(ch, titulo, w=16, h=8):
    ch.title = titulo; ch.width = w; ch.height = h
    if ch.legend is not None: ch.legend.position = "b"
    return ch

# Gráfico 1: estado (última reunião)
g1 = BarChart(); g1.type = "col"; g1.varyColors = True
g1.add_data(Reference(pn, min_col=2, min_row=11, max_row=15), titles_from_data=True)
g1.set_categories(Reference(pn, min_col=1, min_row=12, max_row=15))
g1.add_data  # noqa
s = g1.series[0]
from openpyxl.chart.marker import DataPoint
for i, cor in enumerate(EST):
    dp = DataPoint(idx=i); dp.graphicalProperties = GraphicalProperties(solidFill=cor); s.dPt.append(dp)
s.dLbls = DataLabelList(); s.dLbls.showVal = True; s.dLbls.showSerName = False; s.dLbls.showCatName = False; s.dLbls.showLegendKey = False; s.dLbls.showPercent = False
g1.legend = None; estilo(g1, "Estado das tarefas — última reunião", 14, 7.5)
pn.add_chart(g1, "H4")

# Gráfico 2: estado das tarefas por reunião (empilhado, folha Reuniões)
g2 = BarChart(); g2.type = "col"; g2.grouping = "stacked"; g2.overlap = 100
for j in range(4):
    g2.add_data(Reference(re_, min_col=6 + j, min_row=1, max_row=1 + N), titles_from_data=True)
    g2.series[j].graphicalProperties = GraphicalProperties(solidFill=EST[j])
g2.set_categories(Reference(re_, min_col=1, min_row=2, max_row=1 + N))
estilo(g2, "Estado das tarefas por reunião", 18, 7.5)
pn.add_chart(g2, "H20")

# Gráfico 3: presença por reunião (%)
g3 = BarChart(); g3.type = "col"
g3.add_data(Reference(re_, min_col=5, min_row=1, max_row=1 + N), titles_from_data=True)
g3.set_categories(Reference(re_, min_col=1, min_row=2, max_row=1 + N))
g3.series[0].graphicalProperties = GraphicalProperties(solidFill="2A78D6")
g3.y_axis.scaling.min = 0; g3.y_axis.scaling.max = 1; g3.y_axis.numFmt = "0%"; g3.legend = None
estilo(g3, "Presença por reunião", 18, 7.5)
pn.add_chart(g3, "H36")

# Gráfico 4: tarefas por responsável (empilhado horizontal)
g4 = BarChart(); g4.type = "bar"; g4.grouping = "stacked"; g4.overlap = 100
for j in range(4):
    g4.add_data(Reference(pn, min_col=2 + j, min_row=19, max_row=39), titles_from_data=True)
    g4.series[j].graphicalProperties = GraphicalProperties(solidFill=EST[j])
g4.set_categories(Reference(pn, min_col=1, min_row=20, max_row=39))
estilo(g4, "Tarefas por responsável — última reunião", 18, 9)
pn.add_chart(g4, "R4")

# Gráfico 5: assiduidade (%)
g5 = BarChart(); g5.type = "bar"
g5.add_data(Reference(pn, min_col=5, min_row=43, max_row=63), titles_from_data=True)
g5.set_categories(Reference(pn, min_col=1, min_row=44, max_row=63))
g5.series[0].graphicalProperties = GraphicalProperties(solidFill="1BAF7A")
g5.x_axis.scaling.min = 0; g5.y_axis.scaling.min = 0; g5.y_axis.scaling.max = 1; g5.y_axis.numFmt = "0%"; g5.legend = None
estilo(g5, "Assiduidade por pessoa", 18, 9)
pn.add_chart(g5, "R24")

wb.calculation.fullCalcOnLoad = True
wb.save("modelo-kaizen.xlsx")
print("ok")
