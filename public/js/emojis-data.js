  // ===================================================================
  // CATÁLOGO DE EMOJIS por categoria (threads/pastas) — [emoji, nome]
  // ===================================================================
  export const EMOJI_CATS = [
    { id: 'pop', label: 'Populares', emojis: [
      ['💬','conversa'],['💡','ideia'],['📝','nota'],['📌','fixar'],['⭐','favorito'],['🔥','urgente'],
      ['🎯','meta'],['✅','tarefa'],['🗒️','lembrete'],['📔','diário'],['🧠','estudo'],['❤️','importante'],
      ['🎨','arte'],['🌱','novo'],['⚡','energia'],['🔔','alerta']] },
    { id: 'saude', label: 'Saúde', emojis: [
      ['💊','remédio'],['🩺','médico'],['🏥','hospital'],['🚑','ambulância'],['💉','vacina'],['🩹','curativo'],
      ['🦷','dentista'],['👁️','olhos'],['🫀','coração'],['🦴','ortopedia'],['🧬','exame'],['👩‍⚕️','doutora'],
      ['👨‍⚕️','doutor'],['🧘','meditação'],['🏋️','academia'],['🥗','dieta'],['🚭','parar de fumar'],['⚕️','clínica'],
      ['🤒','doente'],['🧴','tratamento']] },
    { id: 'trab', label: 'Trabalho', emojis: [
      ['💼','emprego'],['🖥️','computador'],['📊','relatório'],['📈','crescimento'],['📉','queda'],['🧾','recibo'],
      ['📎','anexo'],['🗂️','arquivos'],['📄','documento'],['🖊️','assinatura'],['💵','pagamento'],['💰','dinheiro'],
      ['💳','cartão'],['🤝','reunião'],['📧','email'],['⏰','prazo'],['📁','pasta'],['📂','projetos'],
      ['👔','cliente'],['🪪','crachá']] },
    { id: 'escola', label: 'Escola & Estudos', emojis: [
      ['🎓','formatura'],['🏫','escola'],['📚','livros'],['📖','leitura'],['✏️','lição'],['📐','matemática'],
      ['🔬','ciência'],['🔭','pesquisa'],['🧮','contas'],['🔢','números'],['🌍','geografia'],['🚌','ônibus escolar'],
      ['🧪','química'],['🎒','mochila'],['🏅','nota boa'],['📜','certificado']] },
    { id: 'fam', label: 'Casa & Família', emojis: [
      ['🏡','casa'],['🔑','chaves'],['🛏️','cama'],['🛁','banho'],['🍳','cozinha'],['🧹','limpeza'],
      ['🧺','roupas'],['🪴','plantas'],['🔧','reparo'],['🛠️','ferramentas'],['👶','bebê'],['🧒','filhos'],
      ['🐶','cachorro'],['🐱','gato'],['👨‍👩‍👧‍👦','família'],['💝','presente família'],['🎂','aniversário'],['🎁','presente'],
      ['🛒','compras'],['💡','conta de luz']] },
    { id: 'viagem', label: 'Viagens & Lazer', emojis: [
      ['✈️','voo'],['🚗','carro'],['🚆','trem'],['🛳️','cruzeiro'],['🧳','malas'],['🗺️','roteiro'],
      ['🏖️','praia'],['🏔️','montanha'],['🏕️','acampamento'],['🌴','férias'],['🎡','passeio'],['🎟️','ingresso'],
      ['📸','fotos'],['🚲','bike'],['🗽','turismo'],['🧭','aventura'],['⛽','gasolina'],['🏨','hotel']] },
    { id: 'ent', label: 'Séries, Filmes & Jogos', emojis: [
      ['🎬','filme'],['📺','série'],['🍿','cinema'],['🎮','jogo'],['🕹️','videogame'],['🎵','música'],
      ['🎧','podcast'],['🎤','show'],['🎸','violão'],['🎭','teatro'],['🎲','boardgame'],['🃏','cartas'],
      ['🎰','aposta'],['📕','romance'],['🎪','festival'],['🎬','maratona']] },
    { id: 'anime', label: 'Animes & HQs', emojis: [
      ['🍥','anime'],['⚔️','batalha'],['🐉','dragão'],['🥷','ninja'],['👻','terror'],['🦸','herói'],
      ['🦹','vilão'],['🧙','magia'],['🧝','fantasia'],['🚀','ficção'],['👾','retro'],['💥','ação'],
      ['🌀','isekai'],['🎴','card game'],['📕','mangá'],['✨','épico']] },
    { id: 'comida', label: 'Comida & Bebidas', emojis: [
      ['🍕','pizza'],['🍔','hamburguer'],['🌮','mexicano'],['🍣','japonês'],['🍜','lámen'],['🍎','fruta'],
      ['🥑','saudável'],['🍰','sobremesa'],['🍞','padaria'],['☕','café'],['🍺','bar'],['🍷','vinho'],
      ['🧁','doce'],['🍫','chocolate'],['🥤','bebida'],['🛍️','mercado']] },
    { id: 'esporte', label: 'Esportes', emojis: [
      ['⚽','futebol'],['🏀','basquete'],['🎾','tênis'],['🏐','vôlei'],['🏈','foot americano'],['🏓','ping pong'],
      ['⛳','golfe'],['🚴','pedalada'],['🏊','natação'],['🥋','luta'],['🤸','exercício'],['🏆','campeonato'],
      ['🥇','vitória'],['🎽','corrida'],['⛸️','patinação'],['🎿','esqui']] },
    { id: 'financas', label: 'Finanças', emojis: [
      ['💰','economia'],['💸','gasto'],['💳','fatura'],['🏦','banco'],['📈','investimento'],['📉','perda'],
      ['🧾','boleto'],['🪙','moedas'],['💎','reserva'],['📋','orçamento'],['🗓️','vencimento'],['🤑','lucro']] },
    { id: 'natureza', label: 'Natureza & Clima', emojis: [
      ['🌻','jardim'],['🌳','árvore'],['🌸','flores'],['🌊','mar'],['☀️','verão'],['🌙','noite'],
      ['⛅','tempo'],['🌈','chuva passou'],['🐢','pet lento'],['🦋','borboletas'],['🐝','abelhas'],['🌵','deserto'],
      ['🍀','sorte'],['🐾','animais'],['🍄','trilha'],['❄️','inverno']] },
    { id: 'simbolos', label: 'Símbolos & Objetos', emojis: [
      ['🔒','privado'],['⚙️','config'],['♻️','rotina'],['🆘','emergência'],['📅','data'],['📦','encomenda'],
      ['🏷️','etiqueta'],['🧩','misc'],['🔍','pesquisar'],['🗑️','lixo'],['📱','celular'],['💻','notebook'],
      ['🌐','internet'],['🔗','link'],['🚨','importante agora'],['♾️','recorrente']] },
  ];
